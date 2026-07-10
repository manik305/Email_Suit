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
from .activity_logs import log_activity

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
    recipient_name = recipient.name or (f"{recipient.first_name} {recipient.last_name}" if recipient.first_name or recipient.last_name else "there")
    return (
        template
        .replace("{{name}}", recipient_name).replace("{name}", recipient_name)
        .replace("{{first_name}}", recipient.first_name or "").replace("{first_name}", recipient.first_name or "")
        .replace("{{last_name}}", recipient.last_name or "").replace("{last_name}", recipient.last_name or "")
        .replace("{{email}}", recipient.email).replace("{email}", recipient.email)
        .replace("{{designation}}", recipient.title or "").replace("{designation}", recipient.title or "")
        .replace("{{department}}", recipient.department or "").replace("{department}", recipient.department or "")
        .replace("{{industry}}", recipient.industry or "").replace("{industry}", recipient.industry or "")
        .replace("{{region}}", recipient.region or "").replace("{region}", recipient.region or "")
        .replace("{{company_name}}", recipient.company_name or "").replace("{company_name}", recipient.company_name or "")
        .replace("{{company}}", recipient.company_name or "").replace("{company}", recipient.company_name or "")
    )


async def _assert_campaign_access(campaign_id: str, email: str) -> models.Campaign:
    campaign = await _get_campaign_or_404(campaign_id)
    user = await models.User.find_one(email=email)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.role != "admin":
        member = await models.ProjectMember.find_one(user_id=user.id, project_id=campaign.project_id)
        if not member:
            raise HTTPException(status_code=403, detail="You do not have access to this campaign's project.")
    return campaign


# ─── List / Create ────────────────────────────────────────────────────────────

@router.get("/", response_model=List[schemas.Campaign])
async def list_campaigns(
    project_id: Optional[str] = Query(None),
    current_user_email: str = Depends(get_current_user_email)
):
    user = await models.User.find_one(email=current_user_email)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
        
    if user.role == "admin":
        if project_id:
            return await models.Campaign.find(project_id=project_id).sort("-created_at").to_list()
        return await models.Campaign.find_all().sort("-created_at").to_list()
        
    # Non-admin users: get their projects
    memberships = await models.ProjectMember.find(user_id=user.id).to_list()
    project_ids = {m.project_id for m in memberships}
    
    if project_id:
        if project_id not in project_ids:
            raise HTTPException(status_code=403, detail="You do not have access to this project.")
        return await models.Campaign.find(project_id=project_id).sort("-created_at").to_list()
        
    # Return all campaigns in all projects they have access to
    all_campaigns = await models.Campaign.find_all().sort("-created_at").to_list()
    return [c for c in all_campaigns if c.project_id in project_ids]


@router.post("/", response_model=schemas.Campaign, status_code=201)
async def create_campaign(payload: schemas.CampaignCreate, current_user_email: str = Depends(get_current_user_email)):
    """
    Create a new campaign.  If `email_config_id` is provided it is validated
    against EmailConfig collection before saving.
    """
    user = await models.User.find_one(email=current_user_email)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    project_id = payload.project_id
    if not project_id:
        # Fallback to first available project
        if user.role == "admin":
            first_project = await models.Project.find_all().limit(1).to_list()
            project_id = first_project[0].id if first_project else None
        else:
            memberships = await models.ProjectMember.find(user_id=user.id).limit(1).to_list()
            project_id = memberships[0].project_id if memberships else None

    if not project_id:
        raise HTTPException(status_code=400, detail="No active project context found. Please create a project first.")

    # Assert project access
    if user.role != "admin":
        member = await models.ProjectMember.find_one(user_id=user.id, project_id=project_id)
        if not member:
            raise HTTPException(status_code=403, detail="You do not have access to this project.")

    email_config_id = payload.email_config_id
    if email_config_id == "":
        email_config_id = None

    if email_config_id:
        config = await models.EmailConfig.get(email_config_id)
        if not config:
            raise HTTPException(status_code=404, detail="EmailConfig not found")
        # Assert config belongs to same project (or is globally accessible)
        if config.project_id and config.project_id != project_id:
            raise HTTPException(status_code=400, detail="Linked EmailConfig belongs to a different project.")

    timezone = getattr(payload, "timezone", "America/New_York") or "America/New_York"
    target_region = getattr(payload, "target_region", "US") or "US"
    
    send_at = payload.send_at
    if not send_at and payload.schedule == "Daily":
        from app.scheduler import calculate_next_send_at
        send_at = calculate_next_send_at(None, payload.schedule, timezone, target_region)

    # Validate all pool config IDs
    email_config_pool = list(payload.email_config_pool or [])
    for pool_config_id in email_config_pool:
        pool_cfg = await models.EmailConfig.get(pool_config_id)
        if not pool_cfg:
            raise HTTPException(status_code=404, detail=f"EmailConfig {pool_config_id} in pool not found")
        if pool_cfg.project_id and pool_cfg.project_id != project_id:
            raise HTTPException(status_code=400, detail=f"Linked Pool EmailConfig {pool_config_id} belongs to a different project.")

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
        email_config_pool=email_config_pool,
        project_id=project_id,
        status="draft",
        created_by=current_user_email,
    )
    await campaign.insert()
    logger.info("Campaign created: %s (%s) by %s", campaign.name, campaign.id, current_user_email)
    await log_activity(
        action="campaign_created",
        category="campaign",
        summary=f"Campaign '{campaign.name}' created",
        project_id=project_id,
        campaign_id=campaign.id,
        user_email=current_user_email,
        details={"campaign_name": campaign.name, "schedule": campaign.schedule, "status": campaign.status},
    )
    return campaign


# ─── Metrics ──────────────────────────────────────────────────────────────────

@router.get("/metrics", response_model=schemas.CampaignMetrics)
async def get_metrics(
    project_id: Optional[str] = Query(None),
    current_user_email: str = Depends(get_current_user_email)
):
    all_campaigns = await models.Campaign.find_all().to_list()
    # Check if the user is an admin
    user = await models.User.find_one(email=current_user_email)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
        
    if user.role == "admin":
        if project_id:
            allowed_campaign_ids = {str(c.id) for c in all_campaigns if c.project_id == project_id}
        else:
            allowed_campaign_ids = {str(c.id) for c in all_campaigns}
    else:
        memberships = await models.ProjectMember.find(user_id=user.id).to_list()
        project_ids = {m.project_id for m in memberships}
        if project_id:
            if project_id not in project_ids:
                raise HTTPException(status_code=403, detail="You do not have access to this project.")
            allowed_campaign_ids = {str(c.id) for c in all_campaigns if c.project_id == project_id and (c.created_by == current_user_email or c.created_by is None)}
        else:
            allowed_campaign_ids = {str(c.id) for c in all_campaigns if c.project_id in project_ids and (c.created_by == current_user_email or c.created_by is None)}
    
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
async def get_campaign(campaign_id: str, current_user_email: str = Depends(get_current_user_email)):
    return await _assert_campaign_access(campaign_id, current_user_email)


@router.patch("/{campaign_id}", response_model=schemas.Campaign)
async def update_campaign(campaign_id: str, payload: schemas.CampaignUpdate, current_user_email: str = Depends(get_current_user_email)):
    campaign = await _assert_campaign_access(campaign_id, current_user_email)

    if payload.project_id is not None:
        user = await models.User.find_one(email=current_user_email)
        if user.role != "admin":
            member = await models.ProjectMember.find_one(user_id=user.id, project_id=payload.project_id)
            if not member:
                raise HTTPException(status_code=403, detail="You do not have access to the target project.")

    if payload.email_config_id is not None:
        if not await models.EmailConfig.get(payload.email_config_id):
            raise HTTPException(status_code=404, detail="EmailConfig not found")

    # Validate pool config IDs if provided
    if payload.email_config_pool is not None:
        for pool_config_id in payload.email_config_pool:
            if not await models.EmailConfig.get(pool_config_id):
                raise HTTPException(status_code=404, detail=f"EmailConfig {pool_config_id} in pool not found")

    update_data = payload.model_dump(exclude_none=True)
    if update_data:
        await campaign.update({"$set": update_data})
        if payload.status in ("active", "paused") or payload.max_contacts_per_company is not None:
            from app.scheduler import apply_company_throttling, update_recipient_send_times
            # Reload to get the latest values
            campaign = await models.Campaign.get(campaign_id)
            if campaign:
                await apply_company_throttling(campaign_id, campaign.max_contacts_per_company or 1)
                await update_recipient_send_times(campaign_id)
        elif payload.send_at is not None or payload.mails_per_minute is not None:
            from app.scheduler import update_recipient_send_times
            await update_recipient_send_times(campaign_id)
        severity = "warning" if payload.status == "paused" else "info"
        await log_activity(
            action="campaign_updated",
            category="campaign",
            summary=f"Campaign '{campaign.name}' updated (fields: {', '.join(update_data.keys())})",
            project_id=campaign.project_id,
            campaign_id=campaign_id,
            user_email=current_user_email,
            severity=severity,
            details={"updated_fields": list(update_data.keys()), "status": campaign.status},
        )
    return campaign


@router.delete("/{campaign_id}", status_code=204)
async def delete_campaign(campaign_id: str, current_user_email: str = Depends(get_current_user_email)):
    campaign = await _assert_campaign_access(campaign_id, current_user_email)
    campaign_name = campaign.name
    project_id = campaign.project_id
    # Purge associated recipients
    recipients = await models.Recipient.find(campaign_id=campaign_id).to_list()
    for r in recipients:
        await r.delete()
    await campaign.delete()
    await log_activity(
        action="campaign_deleted",
        category="campaign",
        summary=f"Campaign '{campaign_name}' deleted along with {len(recipients)} recipients",
        project_id=project_id,
        campaign_id=campaign_id,
        user_email=current_user_email,
        severity="warning",
        details={"campaign_name": campaign_name, "recipients_purged": len(recipients)},
    )


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
    Fire SMTP for all *pending* or active follow-up recipients of this campaign using the new rate-throttled queue processor.
    """
    from app.scheduler import process_campaign_queue
    campaign = await models.Campaign.get(campaign_id)
    res = await process_campaign_queue(campaign_id, limit=limit)
    if res.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Campaign not found")
    if res.get("status") == "already_running":
        raise HTTPException(status_code=409, detail="Campaign is already processing a dispatch queue.")
    severity = "error" if res.get("failed", 0) > 0 else "info"
    await log_activity(
        action="campaign_send_triggered",
        category="email",
        summary=f"Campaign '{campaign.name if campaign else campaign_id}' send triggered (sent={res.get('sent', 0)}, failed={res.get('failed', 0)})",
        project_id=campaign.project_id if campaign else None,
        campaign_id=campaign_id,
        severity=severity,
        details=res,
    )
    return res


# ─── IMAP inbox ───────────────────────────────────────────────────────────────

@router.get("/{campaign_id}/inbox", response_model=schemas.InboxResponse)
async def get_campaign_inbox(
    campaign_id: str,
    mailbox: str = Query(default="INBOX"),
    limit: int = Query(default=100, le=500),
):
    """
    Fetch the most recent messages from the IMAP mailbox of the campaign's
    attached email account. Also dynamically aggregates Delivery Status Notifications (Failure)
    for bounced recipients in the campaign, making sure they are marked as inbox mails.
    """
    campaign = await _get_campaign_or_404(campaign_id)
    
    messages = []
    error_msg = None
    
    # 1. Fetch real IMAP messages if IMAP settings are available
    if campaign.email_config_id:
        try:
            config = await _get_config_for_campaign(campaign)
            if config.imap:
                messages = await fetch_inbox(config, mailbox=mailbox, limit=limit)
        except Exception as e:
            logger.warning("Could not fetch actual IMAP inbox: %s", e)
            error_msg = str(e)
            
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
                ),
                response_category=r.response_category or "bounce",
            )
            # Prepend so failures appear prominently at the top
            messages.insert(0, bounce_msg)
    except Exception as e:
        logger.error("Error generating bounced inbox messages: %s", e)

    # 3. Auto-detect bounce messages from IMAP and tag response_category
    for msg in messages:
        if msg.response_category:
            continue  # Already classified
        is_bounce = (
            "delivery status" in msg.subject.lower()
            or "undelivered" in msg.subject.lower()
            or "undeliverable" in msg.subject.lower()
            or "mailer-daemon" in msg.from_addr.lower()
            or "postmaster" in msg.from_addr.lower()
        )
        if is_bounce:
            msg.response_category = "bounce"

    # 4. Check DNC status for each message sender and enrich with existing classification
    if campaign.project_id:
        for msg in messages:
            if msg.response_category:
                continue  # Already tagged (bounce or pre-classified)
            # Extract email from from_addr (may be "Name <email>" format)
            sender_email = msg.from_addr
            if "<" in sender_email and ">" in sender_email:
                sender_email = sender_email.split("<")[1].split(">")[0].strip()
            sender_email = sender_email.strip().lower()
            # Check DNC
            dnc_entry = await models.DncEntry.find_one(
                email=sender_email,
                project_id=campaign.project_id,
            )
            if dnc_entry:
                msg.response_category = dnc_entry.reason

    return schemas.InboxResponse(
        campaign_id=campaign_id,
        mailbox=mailbox,
        messages=messages,
        error=error_msg,
    )


# ─── Analytics Detail (with DNC response breakdown) ─────────────────────────

@router.get("/{campaign_id}/analytics-detail", response_model=schemas.CampaignAnalyticsDetail)
async def get_analytics_detail(
    campaign_id: str,
    current_user_email: str = Depends(get_current_user_email),
):
    """
    Detailed analytics for a campaign including response category breakdowns.
    """
    campaign = await _get_campaign_or_404(campaign_id)
    recipients = await models.Recipient.find(campaign_id=campaign_id).to_list()

    total = len(recipients)
    sent = len([r for r in recipients if r.status in ("sent", "replied", "bounced")])
    pending = len([r for r in recipients if r.status == "pending"])
    bounced = len([r for r in recipients if r.status == "bounced"])

    # Response category counts
    leads = len([r for r in recipients if r.response_category == "lead"])
    hot = len([r for r in recipients if r.response_category == "hot"])
    cold = len([r for r in recipients if r.response_category == "cold"])
    negative = len([r for r in recipients if r.response_category == "negative"])
    bounce_classified = len([r for r in recipients if r.response_category == "bounce"])
    total_responded = leads + hot + cold + negative + bounce_classified

    delivery_rate = round((sent / total * 100), 1) if total > 0 else 0.0
    response_rate = round((total_responded / sent * 100), 1) if sent > 0 else 0.0

    return schemas.CampaignAnalyticsDetail(
        total_recipients=total,
        total_sent=sent,
        total_pending=pending,
        total_bounced=bounced,
        total_responded=total_responded,
        leads=leads,
        hot=hot,
        cold=cold,
        negative=negative,
        bounce_classified=bounce_classified,
        delivery_rate=delivery_rate,
        response_rate=response_rate,
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
    
    # 1. Determine format and parse (case-insensitive extensions)
    filename_lower = file.filename.lower()
    if filename_lower.endswith(('.xls', '.xlsx')):
        try:
            df = pd.read_excel(io.BytesIO(content))
        except Exception as e:
            logger.exception("Failed to parse Excel file")
            raise HTTPException(status_code=400, detail=f"Failed to parse Excel file: {str(e)}")
    elif filename_lower.endswith('.csv'):
        try:
            df = pd.read_csv(io.BytesIO(content))
        except UnicodeDecodeError:
            try:
                # Fallback encoding for standard Windows/Excel CSV exports
                df = pd.read_csv(io.BytesIO(content), encoding="latin-1")
            except Exception as e:
                logger.exception("Failed to parse CSV file with fallback encoding")
                raise HTTPException(status_code=400, detail=f"Failed to parse CSV file: {str(e)}")
        except Exception as e:
            logger.exception("Failed to parse CSV file")
            raise HTTPException(status_code=400, detail=f"Failed to parse CSV file: {str(e)}")
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload an Excel (.xlsx/.xls) or CSV (.csv) file.")
    
    # 2. Extract and match headers flexibly
    original_headers = [str(c) for c in df.columns]
    normalized_headers = [c.strip().lower() for c in original_headers]
    df.columns = normalized_headers
    
    # Find the email column with extended alias support
    email_col = None
    email_aliases = [
        "mail id", "email", "email address", "mail", "email_address", 
        "e-mail", "e_mail", "recipient email", "recipient_email", 
        "contact", "contacts", "lead email", "lead_email"
    ]
    for possible_name in email_aliases:
        if possible_name in normalized_headers:
            email_col = possible_name
            break
            
    if not email_col:
        raise HTTPException(
            status_code=400,
            detail="Validation failed. The file must contain a 'mail id' or 'email' column."
        )
    
    # Helper to get column value case-insensitively with fallback aliases
    def get_row_val(row_data, field_name: str, aliases: list = []):
        for name in [field_name] + aliases:
            normalized_name = name.strip().lower()
            if normalized_name in normalized_headers:
                val = row_data[normalized_name]
                if pd.notna(val):
                    return str(val).strip()
        return None
    
    # Map normalized headers back to rows
    count = 0
    for _, row in df.iterrows():
        # Get mail ID
        email = str(row[email_col]).strip()
        if not email or '@' not in email or email.lower() == 'nan':
            continue
            
        first_name = get_row_val(row, "first name", ["first_name", "firstname", "first"])
        last_name = get_row_val(row, "last name", ["last_name", "lastname", "last"])
        
        # Combine into name
        name_parts = []
        if first_name: name_parts.append(first_name)
        if last_name: name_parts.append(last_name)
        name = " ".join(name_parts) if name_parts else None
        
        alt_email = get_row_val(row, "alternative mail id", ["alternative_email", "alternative email", "alt email", "alt mail", "alternative mail"])
        title = get_row_val(row, "title", ["designation", "job title", "job_title", "role"])
        dept = get_row_val(row, "department", ["dept"])
        company = get_row_val(row, "company name", ["company_name", "company"])
        web = get_row_val(row, "website", ["web", "url", "site"])
        linkedin = get_row_val(row, "linkedin id", ["linkedin", "linkedin url", "linkedin_url"])
        ind = get_row_val(row, "industry")
        st = get_row_val(row, "state", ["region"])
        pin = get_row_val(row, "pin code", ["pin_code", "pincode", "zip code", "zip_code", "zip", "postal code"])
        ctry = get_row_val(row, "country")
        
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
            new_status = "pending" if existing.status not in ("sent", "replied", "bounced") else existing.status
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
                "status": new_status
            }})
            count += 1
            
    # Run company concentration filter throttling
    from app.scheduler import apply_company_throttling, update_recipient_send_times
    await apply_company_throttling(campaign_id, campaign.max_contacts_per_company or 1)
    await update_recipient_send_times(campaign_id)
            
    return {"status": "success", "rows_added": count}
