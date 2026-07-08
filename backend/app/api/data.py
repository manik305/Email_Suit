"""
data.py  –  /api/v1/data
~~~~~~~~~~~~~~~~~~~~~~~~~
Routes
  POST  /upload                         – upload CSV/Excel of leads
  GET   /recipients                     – list all recipients
  GET   /recipients/by-campaign/{id}    – recipients for a specific campaign
  POST  /recipients/assign              – bulk-assign recipients to a campaign
  PATCH /recipients/{id}/campaign       – assign single recipient to campaign
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Body, Query, Depends
from app.api.auth import get_current_user_email
import pandas as pd
import io
from .. import models, schemas
from typing import List, Optional
from pydantic import BaseModel

router = APIRouter()


# ─── Upload ───────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=dict)
async def upload_data(file: UploadFile = File(...)):
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
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload Excel (.xlsx/.xls) or CSV.")
    
    # 2. Strict Header Validation
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
            detail=f"Validation failed. The file is missing these required headers: {missing_str}"
        )
    
    try:
        count = 0
        for _, row in df.iterrows():
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
            
            region_parts = []
            if st: region_parts.append(st)
            if ctry: region_parts.append(ctry)
            region = ", ".join(region_parts) if region_parts else None
            
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
                
            existing = await models.Recipient.find_one(email=email)
            if not existing:
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
                    status="pending"
                )
                await recipient.insert()
                count += 1
            else:
                await existing.update({"$set": {
                    "name": name or existing.name,
                    "first_name": first_name or existing.first_name,
                    "last_name": last_name or existing.last_name,
                    "alternative_email": alt_email or existing.alternative_email,
                    "designation": title or existing.designation,
                    "department": dept or existing.department,
                    "company_name": company or existing.company_name,
                    "website": web or existing.website,
                    "linkedin_id": linkedin or existing.linkedin_id,
                    "industry": ind or existing.industry,
                    "state": st or existing.state,
                    "pin_code": pin or existing.pin_code,
                    "country": ctry or existing.country,
                    "region": region or existing.region,
                }})
                count += 1
                
        return {"status": "success", "rows_added": count}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


# ─── List recipients ──────────────────────────────────────────────────────────

class RecipientCreateRequest(BaseModel):
    email: str
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    alternative_email: Optional[str] = None
    title: Optional[str] = None
    department: Optional[str] = None
    company_name: Optional[str] = None
    website: Optional[str] = None
    linkedin_url: Optional[str] = None
    industry: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None
    campaign_id: Optional[str] = None

@router.post("/recipients", response_model=schemas.Recipient)
async def create_recipient(req: RecipientCreateRequest):
    existing = await models.Recipient.find_one(email=req.email)
    if existing:
        raise HTTPException(status_code=400, detail="A lead with this email address already exists.")
        
    recipient = models.Recipient(
        email=req.email,
        name=req.name or f"{req.first_name or ''} {req.last_name or ''}".strip(),
        first_name=req.first_name,
        last_name=req.last_name,
        alternative_email=req.alternative_email,
        title=req.title,
        department=req.department,
        company_name=req.company_name,
        website=req.website,
        linkedin_url=req.linkedin_url,
        industry=req.industry,
        state=req.state,
        zip_code=req.zip_code,
        country=req.country,
        region=req.region or f"{req.state or ''}, {req.country or ''}".strip(", "),
        campaign_id=req.campaign_id or None,
        status="pending"
    )
    await recipient.insert()
    return recipient

@router.get("/recipients", response_model=List[schemas.Recipient])
async def list_recipients(
    project_id: Optional[str] = Query(None),
    current_user_email: str = Depends(get_current_user_email)
):
    user = await models.User.find_one(email=current_user_email)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if user.role == "admin":
        if project_id:
            campaigns = await models.Campaign.find(project_id=project_id).to_list()
        else:
            campaigns = await models.Campaign.find_all().to_list()
    else:
        memberships = await models.ProjectMember.find(user_id=user.id).to_list()
        project_ids = {m.project_id for m in memberships}
        if project_id:
            if project_id not in project_ids:
                raise HTTPException(status_code=403, detail="You do not have access to this project.")
            campaigns = await models.Campaign.find(project_id=project_id).to_list()
        else:
            all_campaigns = await models.Campaign.find_all().to_list()
            campaigns = [c for c in all_campaigns if c.project_id in project_ids]

    campaign_ids = {str(c.id) for c in campaigns}
    all_recipients = await models.Recipient.find_all().sort("-created_at").to_list()
    
    if project_id:
        return [r for r in all_recipients if r.campaign_id in campaign_ids]
    return all_recipients


@router.get("/recipients/by-campaign/{campaign_id}", response_model=List[schemas.Recipient])
async def recipients_by_campaign(campaign_id: str):
    """Return all recipients that belong to a specific campaign."""
    return (
        await models.Recipient.find(campaign_id=campaign_id)
        .sort("-created_at")
        .to_list()
    )


# ─── Assign recipients to a campaign ─────────────────────────────────────────

class BulkAssignRequest(BaseModel):
    campaign_id: str
    recipient_ids: List[str]          # list of Recipient ObjectId strings


@router.post("/recipients/assign", response_model=dict)
async def bulk_assign_recipients(req: BulkAssignRequest):
    """
    Assign a list of recipients to a campaign.
    Sets status=pending so the campaign send job will pick them up.
    """
    if not await models.Campaign.get(req.campaign_id):
        raise HTTPException(status_code=404, detail="Campaign not found")

    updated = 0
    for rid in req.recipient_ids:
        recipient = await models.Recipient.get(rid)
        if recipient:
            await recipient.update({"$set": {
                "campaign_id": req.campaign_id,
                "status": "pending",
            }})
            updated += 1

    return {"assigned": updated, "campaign_id": req.campaign_id}


@router.patch("/recipients/{recipient_id}/campaign", response_model=schemas.Recipient)
async def assign_single_recipient(recipient_id: str, campaign_id: str = Body(..., embed=True)):
    """Assign (or re-assign) a single recipient to a campaign."""
    recipient = await models.Recipient.get(recipient_id)
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    if campaign_id:
        if not await models.Campaign.get(campaign_id):
            raise HTTPException(status_code=404, detail="Campaign not found")

    await recipient.update({"$set": {"campaign_id": campaign_id, "status": "pending"}})
    return recipient


@router.patch("/recipients/{recipient_id}", response_model=schemas.Recipient)
async def patch_recipient(recipient_id: str, payload: dict = Body(...)):
    """Update general fields of a recipient."""
    recipient = await models.Recipient.get(recipient_id)
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
    
    await recipient.update({"$set": payload})
    return recipient


@router.delete("/recipients/{recipient_id}", response_model=dict)
async def delete_recipient(recipient_id: str):
    """Delete a single recipient by ID."""
    recipient = await models.Recipient.get(recipient_id)
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
    await recipient.delete()
    return {"status": "success", "detail": f"Recipient {recipient_id} deleted successfully."}


@router.delete("/database/reset", response_model=dict)
async def reset_database():
    """Wipe all database tables and re-execute schema initialization."""
    from app.database import db_pool, DATABASE_URL
    import os
    if not db_pool:
        raise HTTPException(status_code=500, detail="Database connection not initialized")
    
    try:
        async with db_pool.acquire() as conn:
            # Drop all tables
            await conn.execute("""
                DROP TABLE IF EXISTS public.recipients CASCADE;
                DROP TABLE IF EXISTS public.campaigns CASCADE;
                DROP TABLE IF EXISTS public.email_configs CASCADE;
                DROP TABLE IF EXISTS public.meetings CASCADE;
                DROP TABLE IF EXISTS public.profiles CASCADE;
                DROP TABLE IF EXISTS public.social_posts CASCADE;
                DROP TABLE IF EXISTS public.social_channels CASCADE;
                DROP TABLE IF EXISTS public.voice_agents CASCADE;
            """)
            
            # Re-read and re-execute schema.sql
            schema_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "schema.sql")
            if os.path.exists(schema_path):
                with open(schema_path, "r", encoding="utf-8") as f:
                    schema_sql = f.read()
                
                if "supabase.co" in DATABASE_URL:
                    schema_sql = schema_sql.replace("CREATE SCHEMA IF NOT EXISTS auth;", "")
                    schema_sql = schema_sql.replace(
                        "CREATE TABLE IF NOT EXISTS auth.users (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    email VARCHAR(255) UNIQUE,\n    raw_user_meta_data JSONB\n);",
                        ""
                    )
                    schema_sql = schema_sql.replace(
                        "CREATE OR REPLACE TRIGGER on_auth_user_created\n  AFTER INSERT ON auth.users\n  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();",
                        ""
                    )
                    schema_sql = schema_sql.replace(
                        "CREATE TRIGGER on_auth_user_created\n  AFTER INSERT ON auth.users\n  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();",
                        ""
                    )
                
                await conn.execute(schema_sql)
                
                # Execute compatibility migrations
                await conn.execute("""
                    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
                    ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
                    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hashed_password VARCHAR(255);
                    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE NOT NULL;
                    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS otp VARCHAR(50);
                    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP WITH TIME ZONE;
                    ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS name VARCHAR(255);
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS target_region VARCHAR(100) DEFAULT 'US' NOT NULL;
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS follow_up_templates JSONB;
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS mails_per_minute INTEGER DEFAULT 2;
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS daily_fresh_limit INTEGER DEFAULT 100;
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS max_contacts_per_company INTEGER DEFAULT 1;
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0;
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS diagnostic_error TEXT;
                    ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP WITH TIME ZONE;
                    ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMP WITH TIME ZONE;
                    ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS open_count INTEGER DEFAULT 0 NOT NULL;
                    ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0 NOT NULL;
                    ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS send_at TIMESTAMP WITH TIME ZONE;
                    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS sender_email VARCHAR(255);
                    CREATE TABLE IF NOT EXISTS public.recipient_events (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        recipient_id UUID REFERENCES public.recipients(id) ON DELETE CASCADE,
                        event_type VARCHAR(50) NOT NULL,
                        link_url TEXT,
                        ip_address VARCHAR(100),
                        user_agent TEXT,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
                    );
                    ALTER TABLE public.email_configs ADD COLUMN IF NOT EXISTS daily_limit INTEGER DEFAULT 500 NOT NULL;
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS email_config_pool JSONB DEFAULT '[]';
                    CREATE TABLE IF NOT EXISTS public.email_config_daily_quota (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        email_config_id UUID REFERENCES public.email_configs(id) ON DELETE CASCADE,
                        quota_date DATE NOT NULL,
                        emails_sent INTEGER DEFAULT 0 NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
                        UNIQUE(email_config_id, quota_date)
                    );
                    CREATE INDEX IF NOT EXISTS idx_quota_config_date ON public.email_config_daily_quota(email_config_id, quota_date);
                    
                    -- Project-Level Management Migration
                    CREATE TABLE IF NOT EXISTS public.projects (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        name VARCHAR(255) NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS public.project_members (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
                        project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
                        role VARCHAR(50) DEFAULT 'member' NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
                        UNIQUE(user_id, project_id)
                    );
                    ALTER TABLE public.email_configs ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
                    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS icp_titles JSONB DEFAULT '[]';
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS icp_departments JSONB DEFAULT '[]';
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS icp_industries JSONB DEFAULT '[]';
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS icp_regions JSONB DEFAULT '[]';
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS icp_active BOOLEAN DEFAULT FALSE;
                """)
                
            return {"status": "success", "detail": "Database dropped and reset successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database reset failed: {str(e)}")


@router.get("/recipients/{recipient_id}/preview", response_model=schemas.RecipientPreviewResponse)
async def get_recipient_draft_preview(recipient_id: str):
    """
    Generate and return the exact email subject and body template preview
    for a specific recipient, resolving all dynamic template tags.
    """
    recipient = await models.Recipient.get(recipient_id)
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
        
    campaign = await models.Campaign.get(recipient.campaign_id) if recipient.campaign_id else None
    if not campaign:
        raise HTTPException(status_code=404, detail="Recipient is not associated with any campaign")

    sender_name = "Outreach Team"
    if campaign.email_config_id:
        config = await models.EmailConfig.get(campaign.email_config_id)
        if config and config.sender_name:
            sender_name = config.sender_name

    subject_tpl = campaign.subject or f"Hi from {sender_name}"
    body_tpl = campaign.body_template or "Hi {name},\n\nThis is an outreach from our team."

    recipient_name = recipient.name or (f"{recipient.first_name} {recipient.last_name}" if recipient.first_name or recipient.last_name else "there")
    
    is_follow_up = (recipient.status == "sent")
    
    if not is_follow_up:
        subject = (
            subject_tpl
            .replace("{name}", recipient_name)
            .replace("{first_name}", recipient.first_name or "")
            .replace("{last_name}", recipient.last_name or "")
            .replace("{email}", recipient.email)
            .replace("{designation}", recipient.title or "")
            .replace("{department}", recipient.department or "")
            .replace("{industry}", recipient.industry or "")
            .replace("{region}", recipient.region or "")
            .replace("{company_name}", recipient.company_name or "")
            .replace("{company}", recipient.company_name or "")
        )
        body = (
            body_tpl
            .replace("{name}", recipient_name)
            .replace("{first_name}", recipient.first_name or "")
            .replace("{last_name}", recipient.last_name or "")
            .replace("{email}", recipient.email)
            .replace("{designation}", recipient.title or "")
            .replace("{department}", recipient.department or "")
            .replace("{industry}", recipient.industry or "")
            .replace("{region}", recipient.region or "")
            .replace("{company_name}", recipient.company_name or "")
            .replace("{company}", recipient.company_name or "")
        )
    else:
        next_count = recipient.follow_up_count + 1
        subject_raw = f"Re: {subject_tpl}"
        subject = (
            subject_raw
            .replace("{name}", recipient_name)
            .replace("{first_name}", recipient.first_name or "")
            .replace("{last_name}", recipient.last_name or "")
            .replace("{email}", recipient.email)
            .replace("{designation}", recipient.title or "")
            .replace("{department}", recipient.department or "")
            .replace("{industry}", recipient.industry or "")
            .replace("{region}", recipient.region or "")
            .replace("{company_name}", recipient.company_name or "")
            .replace("{company}", recipient.company_name or "")
        )
        body = None
        if campaign.follow_up_templates and len(campaign.follow_up_templates) > next_count:
            body = campaign.follow_up_templates[next_count]
        if not body:
            body = (
                f"Hi {recipient_name},\n\n"
                f"Just following up on my previous message regarding {campaign.name}. "
                f"I wanted to quickly check back and see if you had any thoughts or questions!\n\n"
                f"Best regards,\n"
                f"{sender_name}"
            )
        else:
            body = (
                body
                .replace("{name}", recipient_name)
                .replace("{first_name}", recipient.first_name or "")
                .replace("{last_name}", recipient.last_name or "")
                .replace("{email}", recipient.email)
                .replace("{designation}", recipient.title or "")
                .replace("{department}", recipient.department or "")
                .replace("{industry}", recipient.industry or "")
                .replace("{region}", recipient.region or "")
                .replace("{company_name}", recipient.company_name or "")
                .replace("{company}", recipient.company_name or "")
            )

    return {
        "recipient_id": recipient_id,
        "subject": subject,
        "body": body
    }
