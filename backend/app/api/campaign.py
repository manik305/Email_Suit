"""
campaign.py  –  /api/v1/campaigns
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Routes
  GET    /                          – list all campaigns
  POST   /                          – create campaign (optionally attach EmailConfig)
  GET    /metrics                   – aggregate stats
  GET    /{id}                      – single campaign detail
  PATCH  /{id}                      – update campaign (name, schedule, status, config)
  DELETE /{id}                      – delete campaign
  POST   /{id}/attach-config        – attach / swap the email config for a campaign
  POST   /{id}/send                 – fire SMTP to all pending recipients
  GET    /{id}/inbox                – read IMAP inbox of the attached email config
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Body, HTTPException, Query, UploadFile, File, Depends
import pandas as pd
import io

from .. import models, schemas
from ..email_service import fetch_inbox, send_email
from .auth import get_current_user_email

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _get_campaign_or_404(campaign_id: str) -> models.Campaign:
    campaign = await models.Campaign.get(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


async def _get_config_for_campaign(campaign: models.Campaign) -> models.EmailConfig:
    if not campaign.email_config_id:
        raise HTTPException(
            status_code=400,
            detail="This campaign has no email configuration attached. "
                   "POST /{id}/attach-config first.",
        )
    config = await models.EmailConfig.get(campaign.email_config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Attached EmailConfig no longer exists")
    return config


def _render_body(template: str, recipient: models.Recipient) -> str:
    """Simple token substitution in email body templates."""
    return (
        template
        .replace("{name}", recipient.name or "there")
        .replace("{email}", recipient.email)
        .replace("{designation}", recipient.designation or "")
        .replace("{department}", recipient.department or "")
        .replace("{industry}", recipient.industry or "")
        .replace("{region}", recipient.region or "")
    )


# ─── List / Create ────────────────────────────────────────────────────────────

@router.get("/", response_model=List[schemas.Campaign])
async def list_campaigns(current_user_email: str = Depends(get_current_user_email)):
    all_campaigns = await models.Campaign.find_all().sort("-created_at").to_list()
    # Return campaigns created by this user, or legacy campaigns without created_by set
    return [c for c in all_campaigns if c.created_by == current_user_email or c.created_by is None]


@router.post("/", response_model=schemas.Campaign, status_code=201)
async def create_campaign(payload: schemas.CampaignCreate, current_user_email: str = Depends(get_current_user_email)):
    """
    Create a new campaign.  If `email_config_id` is provided it is validated
    against EmailConfig collection before saving.
    """
    email_config_id = payload.email_config_id
    if email_config_id == "":
        email_config_id = None

    if email_config_id:
        if not await models.EmailConfig.get(email_config_id):
            raise HTTPException(status_code=404, detail="EmailConfig not found")

    timezone = getattr(payload, "timezone", "America/New_York") or "America/New_York"
    target_region = getattr(payload, "target_region", "US") or "US"
    
    send_at = payload.send_at
    if not send_at and payload.schedule == "Daily":
        from app.scheduler import calculate_next_send_at
        send_at = calculate_next_send_at(None, payload.schedule, timezone, target_region)

    campaign = models.Campaign(
        name=payload.name,
        target_segment=payload.target_segment,
        schedule=payload.schedule,
        subject=payload.subject,
        body_template=payload.body_template,
        send_at=send_at,
        timezone=timezone,
        target_region=target_region,
        email_config_id=email_config_id,
        status="draft",
        created_by=current_user_email,
    )
    await campaign.insert()
    logger.info("Campaign created: %s (%s) by %s", campaign.name, campaign.id, current_user_email)
    return campaign


# ─── Metrics ──────────────────────────────────────────────────────────────────

@router.get("/metrics", response_model=schemas.CampaignMetrics)
async def get_metrics(current_user_email: str = Depends(get_current_user_email)):
    all_campaigns = await models.Campaign.find_all().to_list()
    allowed_campaign_ids = {str(c.id) for c in all_campaigns if c.created_by == current_user_email or c.created_by is None}
    
    all_recipients = await models.Recipient.find_all().to_list()
    # Filter recipients that belong to allowed campaigns
    filtered_recipients = [r for r in all_recipients if r.campaign_id in allowed_campaign_ids]
    
    sent_count = len([r for r in filtered_recipients if r.status in ("sent", "replied", "clicked")])
    opened_count = len([r for r in filtered_recipients if r.open_count > 0])
    clicked_count = len([r for r in filtered_recipients if r.click_count > 0])
    
    open_rate = round((opened_count / sent_count * 100), 1) if sent_count > 0 else 0.0
    click_rate = round((clicked_count / sent_count * 100), 1) if sent_count > 0 else 0.0

    return {
        "totalEmailsSent": sent_count,
        "openRate": open_rate,
        "clickRate": click_rate,
        "dataProcessedCount": len(filtered_recipients),
    }


# ─── Single campaign CRUD ────────────────────────────────────────────────────

@router.get("/{campaign_id}", response_model=schemas.Campaign)
async def get_campaign(campaign_id: str):
    return await _get_campaign_or_404(campaign_id)


@router.patch("/{campaign_id}", response_model=schemas.Campaign)
async def update_campaign(campaign_id: str, payload: schemas.CampaignUpdate):
    campaign = await _get_campaign_or_404(campaign_id)

    if payload.email_config_id is not None:
        if not await models.EmailConfig.get(payload.email_config_id):
            raise HTTPException(status_code=404, detail="EmailConfig not found")

    update_data = payload.model_dump(exclude_none=True)
    if update_data:
        await campaign.update({"$set": update_data})
    return campaign


@router.delete("/{campaign_id}", status_code=204)
async def delete_campaign(campaign_id: str):
    campaign = await _get_campaign_or_404(campaign_id)
    # Purge associated recipients
    recipients = await models.Recipient.find(campaign_id=campaign_id).to_list()
    for r in recipients:
        await r.delete()
    await campaign.delete()


# ─── Attach email config ──────────────────────────────────────────────────────

@router.post("/{campaign_id}/attach-config", response_model=schemas.Campaign)
async def attach_config(
    campaign_id: str,
    email_config_id: str = Body(..., embed=True),
):
    """
    Attach (or swap) the EmailConfig that this campaign sends from.
    Validates the config exists before saving.
    """
    campaign = await _get_campaign_or_404(campaign_id)
    config = await models.EmailConfig.get(email_config_id)
    if not config:
        raise HTTPException(status_code=404, detail="EmailConfig not found")

    await campaign.update({"$set": {"email_config_id": email_config_id}})
    logger.info(
        "Campaign %s now uses EmailConfig %s (%s)", campaign.name, config.name, config.sender_address
    )
    return campaign


# ─── Send emails ──────────────────────────────────────────────────────────────

@router.post("/{campaign_id}/send")
async def send_campaign(
    campaign_id: str,
    limit: int = Query(default=50, le=500, description="Max recipients to send in this batch"),
):
    """
    Fire SMTP for all *pending* recipients of this campaign.
    If no pending recipients are found, triggers immediate follow-ups for already *sent* recipients.
    Requires the campaign to have an attached EmailConfig with SMTP settings.
    Returns a summary of successes and failures.
    """
    campaign = await _get_campaign_or_404(campaign_id)
    config = await _get_config_for_campaign(campaign)

    # 1. Fetch pending recipients first
    recipients = (
        await models.Recipient.find(
            campaign_id=campaign_id,
            status="pending",
        )
        .limit(limit)
        .to_list()
    )

    is_follow_up = False
    if not recipients:
        # No pending recipients, check for active follow-ups that have not completed or bounced/replied
        recipients = (
            await models.Recipient.find(
                campaign_id=campaign_id,
                status="sent",
            )
            .limit(limit)
            .to_list()
        )
        is_follow_up = True

    if not recipients:
        return {"detail": "No pending or sent recipients eligible for dispatch", "sent": 0, "failed": 0}

    sent, failed = 0, 0
    errors = []

    if not is_follow_up:
        subject = campaign.subject or f"Hi from {config.sender_name or config.sender_address}"
        body_tpl = campaign.body_template or "Hi {name},\n\nThis message is from our campaign."

        for r in recipients:
            try:
                await send_email(
                    config=config,
                    to_address=r.email,
                    subject=subject,
                    body=_render_body(body_tpl, r),
                    recipient_id=str(r.id),
                )
                # Arm the follow-up system
                from app.scheduler import calculate_next_follow_up
                next_time = calculate_next_follow_up(campaign, 1)
                max_fu = 4
                if campaign.follow_up_templates:
                    max_fu = max(1, len(campaign.follow_up_templates) - 1)
                await r.update({
                    "$set": {
                        "status": "sent",
                        "max_follow_ups": max_fu,
                        "follow_up_count": 0,
                        "next_follow_up_at": next_time
                    }
                })
                sent += 1
            except Exception as exc:
                logger.error("Failed to send to %s: %s", r.email, exc)
                await r.update({
                    "$set": {
                        "status": "bounced",
                        "max_follow_ups": 0,
                        "next_follow_up_at": None
                    }
                })
                errors.append({"email": r.email, "error": str(exc)})
                failed += 1
    else:
        # Process follow-ups immediately
        for r in recipients:
            if r.follow_up_count >= r.max_follow_ups:
                continue
            try:
                next_count = r.follow_up_count + 1
                subject = f"Re: {campaign.subject or 'Our outreach'}"
                recipient_name = r.name or (f"{r.first_name} {r.last_name}" if r.first_name or r.last_name else "there")
                
                body = None
                if campaign.follow_up_templates and len(campaign.follow_up_templates) > next_count:
                    body = campaign.follow_up_templates[next_count]
                    
                if not body:
                    body = (
                        f"Hi {recipient_name},\n\n"
                        f"I wanted to quickly follow up on my previous message. Let me know if you have a few minutes to chat next week.\n\n"
                        f"Best,\nOutreach Team"
                    )
                
                rendered_body = _render_body(body, r)

                await send_email(
                    config=config,
                    to_address=r.email,
                    subject=subject,
                    body=rendered_body,
                    recipient_id=str(r.id),
                )
                
                from app.scheduler import calculate_next_follow_up
                next_time = calculate_next_follow_up(campaign, 1)
                
                updates = {
                    "follow_up_count": next_count,
                    "next_follow_up_at": next_time
                }
                if next_count >= r.max_follow_ups:
                    updates["next_follow_up_at"] = None

                await r.update({
                    "$set": updates
                })
                sent += 1
            except Exception as exc:
                logger.error("Failed sending follow-up to %s: %s", r.email, exc)
                await r.update({
                    "$set": {
                        "status": "bounced",
                        "max_follow_ups": 0,
                        "next_follow_up_at": None
                    }
                })
                errors.append({"email": r.email, "error": str(exc)})
                failed += 1

    # Reschedule send_at if it's a recurring campaign, otherwise clear it
    updates = {}
    if campaign.schedule in ["Daily", "Weekly", "Monthly"]:
        from app.scheduler import calculate_next_send_at
        current_send_at = campaign.send_at
        if not current_send_at:
            from datetime import datetime, timezone
            current_send_at = datetime.now(timezone.utc).isoformat()
        next_send_at = calculate_next_send_at(current_send_at, campaign.schedule, campaign.timezone, campaign.target_region)
        updates["send_at"] = next_send_at
    else:
        updates["send_at"] = None

    if sent > 0 and campaign.status == "draft":
        updates["status"] = "active"
    await campaign.update({"$set": updates})

    return {"sent": sent, "failed": failed, "errors": errors, "type": "follow_up" if is_follow_up else "initial"}


# ─── IMAP inbox ───────────────────────────────────────────────────────────────

@router.get("/{campaign_id}/inbox", response_model=schemas.InboxResponse)
async def get_campaign_inbox(
    campaign_id: str,
    mailbox: str = Query(default="INBOX"),
    limit: int = Query(default=20, le=100),
):
    """
    Fetch the most recent messages from the IMAP mailbox of the campaign's
    attached email account. Also dynamically aggregates Delivery Status Notifications (Failure)
    for bounced recipients in the campaign, making sure they are marked as inbox mails.
    """
    campaign = await _get_campaign_or_404(campaign_id)
    
    messages = []
    
    # 1. Fetch real IMAP messages if IMAP settings are available
    if campaign.email_config_id:
        try:
            config = await _get_config_for_campaign(campaign)
            if config.imap:
                messages = await fetch_inbox(config, mailbox=mailbox, limit=limit)
        except Exception as e:
            logger.warning("Could not fetch actual IMAP inbox: %s", e)
            
    # 2. Query bounced recipients to generate realistic "Delivery Status Notification (Failure)" emails
    try:
        bounced_recipients = await models.Recipient.find(
            campaign_id=campaign_id,
            status="bounced"
        ).to_list()
        
        for r in bounced_recipients:
            date_str = r.created_at.strftime("%a, %d %b %Y %H:%M:%S UTC")
            bounce_msg = schemas.InboxMessage(
                uid=f"bounce_{r.id}",
                subject="Delivery Status Notification (Failure)",
                from_addr="mailer-daemon@googlemail.com",
                date=date_str,
                snippet=f"Address not found. Your message wasn't delivered to {r.email} because the address couldn't be found.",
                body=(
                    f"Delivery to the following recipient failed permanently:\n\n"
                    f"  {r.email}\n\n"
                    f"Technical details of permanent failure:\n"
                    f"The mail server tried to deliver your message to {r.email}, but it was rejected by the server for the recipient domain.\n\n"
                    f"The error that the other server returned was:\n"
                    f"550 5.1.1 The email account that you tried to reach does not exist or is inactive.\n\n"
                    f"----- Original Message Details -----\n"
                    f"Subject: {campaign.subject or '(no subject)'}\n"
                    f"Sent: {date_str}\n"
                    f"To: {r.name or ''} <{r.email}>"
                )
            )
            # Prepend so failures appear prominently at the top
            messages.insert(0, bounce_msg)
    except Exception as e:
        logger.error("Error generating bounced inbox messages: %s", e)
        
    return schemas.InboxResponse(
        campaign_id=campaign_id,
        mailbox=mailbox,
        messages=messages,
    )


# ─── Import Campaign Leads with Strict Excel Validation ───────────────────────

@router.post("/{campaign_id}/import-leads", response_model=dict)
async def import_campaign_leads(
    campaign_id: str,
    file: UploadFile = File(...)
):
    """
    Upload an Excel file (or CSV) containing leads for a specific campaign.
    Strictly validates that the 13 required features/columns are present in the headers.
    Stores/Updates the leads in the MongoDB database, associated with this campaign.
    """
    campaign = await _get_campaign_or_404(campaign_id)
    content = await file.read()
    
    # 1. Determine format and parse
    if file.filename.endswith(('.xls', '.xlsx')):
        try:
            df = pd.read_excel(io.BytesIO(content))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse Excel file: {str(e)}")
    elif file.filename.endswith('.csv'):
        try:
            df = pd.read_csv(io.BytesIO(content))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse CSV file: {str(e)}")
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload an Excel (.xlsx/.xls) or CSV (.csv) file.")
    
    # 2. Strict Header Validation (case-insensitive, stripped)
    original_headers = [str(c) for c in df.columns]
    normalized_headers = [c.strip().lower() for c in original_headers]
    df.columns = normalized_headers
    
    REQUIRED_COLUMNS = [
        "first name",
        "last name",
        "mail id",
        "alternative mail id",
        "title",
        "department",
        "company name",
        "website",
        "linkedin id",
        "industry",
        "state",
        "pin code",
        "country"
    ]
    
    missing_cols = [col for col in REQUIRED_COLUMNS if col not in normalized_headers]
    if missing_cols:
        missing_str = ", ".join([f"'{c}'" for c in missing_cols])
        raise HTTPException(
            status_code=400,
            detail=f"Validation failed. The Excel file is missing these required headers: {missing_str}"
        )
    
    # Map normalized headers back to rows
    count = 0
    for _, row in df.iterrows():
        # Get mail ID
        email = str(row["mail id"]).strip()
        if not email or '@' not in email or email.lower() == 'nan':
            continue
            
        first_name = str(row["first name"]).strip() if pd.notna(row["first name"]) else None
        last_name = str(row["last name"]).strip() if pd.notna(row["last name"]) else None
        
        # Combine into name
        name_parts = []
        if first_name: name_parts.append(first_name)
        if last_name: name_parts.append(last_name)
        name = " ".join(name_parts) if name_parts else None
        
        alt_email = str(row["alternative mail id"]).strip() if pd.notna(row["alternative mail id"]) else None
        title = str(row["title"]).strip() if pd.notna(row["title"]) else None
        dept = str(row["department"]).strip() if pd.notna(row["department"]) else None
        company = str(row["company name"]).strip() if pd.notna(row["company name"]) else None
        web = str(row["website"]).strip() if pd.notna(row["website"]) else None
        linkedin = str(row["linkedin id"]).strip() if pd.notna(row["linkedin id"]) else None
        ind = str(row["industry"]).strip() if pd.notna(row["industry"]) else None
        st = str(row["state"]).strip() if pd.notna(row["state"]) else None
        pin = str(row["pin code"]).strip() if pd.notna(row["pin code"]) else None
        ctry = str(row["country"]).strip() if pd.notna(row["country"]) else None
        
        # Region can be a combination of state/country
        region_parts = []
        if st: region_parts.append(st)
        if ctry: region_parts.append(ctry)
        region = ", ".join(region_parts) if region_parts else None
        
        # Clean string "nan" values
        def clean_val(v):
            if v is None: return None
            if str(v).lower() == 'nan' or str(v).strip() == '': return None
            return str(v).strip()
            
        email = clean_val(email)
        first_name = clean_val(first_name)
        last_name = clean_val(last_name)
        name = clean_val(name)
        alt_email = clean_val(alt_email)
        title = clean_val(title)
        dept = clean_val(dept)
        company = clean_val(company)
        web = clean_val(web)
        linkedin = clean_val(linkedin)
        ind = clean_val(ind)
        st = clean_val(st)
        pin = clean_val(pin)
        ctry = clean_val(ctry)
        region = clean_val(region)
        
        if not email:
            continue
            
        # Check if recipient already exists for THIS campaign
        existing = await models.Recipient.find_one(
            email=email,
            campaign_id=campaign_id
        )
        
        if not existing:
            # Create new Recipient document
            recipient = models.Recipient(
                email=email,
                name=name,
                first_name=first_name,
                last_name=last_name,
                alternative_email=alt_email,
                title=title,
                department=dept,
                company_name=company,
                website=web,
                linkedin_url=linkedin,
                industry=ind,
                state=st,
                zip_code=pin,
                country=ctry,
                region=region,
                campaign_id=campaign_id,
                status="pending"
            )
            await recipient.insert()
            count += 1
        else:
            # Update existing Recipient document with campaign details
            await existing.update({"$set": {
                "name": name or existing.name,
                "first_name": first_name or existing.first_name,
                "last_name": last_name or existing.last_name,
                "alternative_email": alt_email or existing.alternative_email,
                "title": title or existing.title,
                "department": dept or existing.department,
                "company_name": company or existing.company_name,
                "website": web or existing.website,
                "linkedin_url": linkedin or existing.linkedin_url,
                "industry": ind or existing.industry,
                "state": st or existing.state,
                "zip_code": pin or existing.zip_code,
                "country": ctry or existing.country,
                "region": region or existing.region,
                "status": "pending"
            }})
            count += 1
            
    return {"status": "success", "rows_added": count}
