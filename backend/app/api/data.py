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
from fastapi import APIRouter, UploadFile, File, HTTPException, Body, Query, Depends, Form, Response
from app.api.auth import get_current_user_email
import pandas as pd
import io
import csv
from datetime import datetime
from .. import models, schemas
from typing import List, Optional
from pydantic import BaseModel

router = APIRouter()

from .activity_logs import log_activity
import logging
data_logger = logging.getLogger(__name__)


# ─── Upload / Ingest Leads (Redesigned Schema) ────────────────────────────────

SCHEMA_DEFINITIONS = [
    ("first name", ["first name", "first_name", "firstname", "first"]),
    ("last name", ["last name", "last_name", "lastname", "last"]),
    ("mail id", ["mail id", "email", "mail", "email address", "e-mail", "email_address"]),
    ("title / designation", ["title / designation", "title", "designation", "job title", "role"]),
    ("company website", ["company website", "website", "company_website", "web", "url", "site"]),
    ("company name", ["company name", "company", "company_name", "organization"]),
    ("revenue", ["revenue", "company revenue", "revenue of that company", "annual revenue"]),
    ("person's linkedin url", ["person's linkedin url", "persons linkedin url", "person linkedin url", "linkedin url", "linkedin id", "linkedin", "linkedin_url"]),
    ("industry", ["industry", "sector"]),
    ("city", ["city", "town"]),
    ("state", ["state", "province"]),
    ("country code", ["country code", "country_code", "countrycode", "iso code", "iso_code"]),
    ("country name", ["country name", "country", "nation"]),
]

@router.post("/upload", response_model=dict)
async def upload_data(file: UploadFile = File(...), campaign_id: Optional[str] = Form(None)):
    content = await file.read()
    
    # 1. Determine format and parse
    filename_lower = file.filename.lower()
    if filename_lower.endswith(('.xls', '.xlsx')):
        try:
            df = pd.read_excel(io.BytesIO(content))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse Excel file: {str(e)}")
    elif filename_lower.endswith('.csv'):
        try:
            df = pd.read_csv(io.BytesIO(content))
        except UnicodeDecodeError:
            try:
                df = pd.read_csv(io.BytesIO(content), encoding="latin-1")
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Failed to parse CSV file: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse CSV file: {str(e)}")
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload Excel (.xlsx/.xls) or CSV.")
    
    # 2. Strict Header Validation matching the redesigned schema
    original_headers = [str(c) for c in df.columns]
    normalized_headers = [c.strip().lower() for c in original_headers]
    df.columns = normalized_headers
    
    missing_cols = []
    col_map = {}
    for canonical, aliases in SCHEMA_DEFINITIONS:
        matched = next((a for a in aliases if a in normalized_headers), None)
        if not matched:
            missing_cols.append(canonical)
        else:
            col_map[canonical] = matched
            
    if missing_cols:
        missing_str = ", ".join([f"'{c}'" for c in missing_cols])
        raise HTTPException(
            status_code=400,
            detail=f"Validation failed. The file is missing these required segment headers: {missing_str}"
        )
    
    def clean_val(v):
        if v is None: return None
        if str(v).lower() == 'nan' or str(v).strip() == '': return None
        return str(v).strip()

    def clean_email(v):
        val = clean_val(v)
        if not val: return None
        return val.strip(" \t\n\r,;\"'")

    try:
        count = 0
        duplicates_skipped = 0
        for _, row in df.iterrows():
            email = clean_email(row[col_map["mail id"]])
            if not email or '@' not in email:
                continue
                
            first_name = clean_val(row[col_map["first name"]])
            last_name = clean_val(row[col_map["last name"]])
            name_parts = [p for p in [first_name, last_name] if p]
            name = " ".join(name_parts) if name_parts else None
            
            title = clean_val(row[col_map["title / designation"]])
            web = clean_val(row[col_map["company website"]])
            company = clean_val(row[col_map["company name"]])
            rev = clean_val(row[col_map["revenue"]])
            linkedin = clean_val(row[col_map["person's linkedin url"]])
            ind = clean_val(row[col_map["industry"]])
            city = clean_val(row[col_map["city"]])
            st = clean_val(row[col_map["state"]])
            country_code = clean_val(row[col_map["country code"]])
            ctry = clean_val(row[col_map["country name"]])
            
            # Optional extra fields
            alt_email = None
            for alt_key in ["alternative mail id", "alternative_email", "alt email", "alt mail"]:
                if alt_key in normalized_headers:
                    alt_email = clean_email(row[alt_key])
                    break
                    
            dept = None
            for dept_key in ["department", "dept"]:
                if dept_key in normalized_headers:
                    dept = clean_val(row[dept_key])
                    break
                    
            pin = None
            for pin_key in ["pin code", "pin_code", "zip code", "zip_code", "zip", "postal code"]:
                if pin_key in normalized_headers:
                    pin = clean_val(row[pin_key])
                    break

            order_id = None
            for o_key in ["order id", "order_id", "orderid", "order number", "order_no"]:
                if o_key in normalized_headers:
                    order_id = clean_val(row[o_key])
                    break

            region_parts = [p for p in [city, st, ctry] if p]
            region = ", ".join(region_parts) if region_parts else None
                
            if campaign_id:
                existing = await models.Recipient.find_one(email=email, campaign_id=campaign_id)
            else:
                existing = await models.Recipient.find_one(email=email, campaign_id=None)
                
            if not existing:
                recipient = models.Recipient(
                    email=email,
                    name=name,
                    first_name=first_name,
                    last_name=last_name,
                    alternative_email=alt_email,
                    order_id=order_id,
                    title=title,
                    department=dept,
                    company_name=company,
                    website=web,
                    revenue=rev,
                    linkedin_url=linkedin,
                    industry=ind,
                    city=city,
                    state=st,
                    country_code=country_code,
                    zip_code=pin,
                    country=ctry,
                    region=region,
                    status="pending",
                    campaign_id=campaign_id
                )
                await recipient.insert()
                count += 1
            else:
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
                    "revenue": rev or existing.revenue,
                    "linkedin_url": linkedin or existing.linkedin_url,
                    "industry": ind or existing.industry,
                    "city": city or existing.city,
                    "state": st or existing.state,
                    "country_code": country_code or existing.country_code,
                    "zip_code": pin or existing.zip_code,
                    "country": ctry or existing.country,
                    "region": region or existing.region,
                    "status": new_status
                }})
                duplicates_skipped += 1
                
        await log_activity(
            action="data_uploaded",
            category="data",
            summary=f"File '{file.filename}' uploaded with {count} recipients" + (f" to campaign {campaign_id}" if campaign_id else "") + f" ({duplicates_skipped} duplicates updated)",
            campaign_id=campaign_id,
            details={"filename": file.filename, "rows_added": count, "duplicates_skipped": duplicates_skipped, "campaign_id": campaign_id},
        )
        return {"status": "success", "rows_added": count, "duplicates_skipped": duplicates_skipped}

    except HTTPException:
        raise
    except Exception as e:
        await log_activity(
            action="data_upload_failed",
            category="error",
            summary=f"File upload '{file.filename}' failed: {str(e)}",
            severity="error",
            campaign_id=campaign_id,
            details={"filename": file.filename, "error": str(e)},
        )
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


# ─── Data Dumping Method (Export Dump & Template) ────────────────────────────

@router.get("/dump")
@router.get("/export")
async def export_data_dump(
    campaign_id: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None)
):
    """
    Data Dumping Method:
    Exports/dumps recipient and lead records adhering to the redesigned schema:
    First Name, Last Name, Mail ID, Title / Designation, Company Website, 
    Company Name, Revenue, Person's LinkedIn URL, Industry, City, State, 
    Country Code, Country Name, Status.
    """
    from app.database import db_pool
    if not db_pool:
        raise HTTPException(status_code=500, detail="Database not initialized")

    query = "SELECT * FROM public.recipients"
    params = []
    where_clauses = []
    if campaign_id:
        from uuid import UUID
        try:
            cid = UUID(campaign_id)
            params.append(cid)
            where_clauses.append(f"campaign_id = ${len(params)}")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid campaign_id format")
            
    if where_clauses:
        query += " WHERE " + " AND ".join(where_clauses)
    query += " ORDER BY created_at DESC"
    
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Redesigned schema CSV headers matching the requested segment
    writer.writerow([
        "First Name",
        "Last Name",
        "Mail ID",
        "Title / Designation",
        "Company Website",
        "Company Name",
        "Revenue",
        "Person's LinkedIn URL",
        "Industry",
        "City",
        "State",
        "Country Code",
        "Country Name",
        "Status"
    ])
    
    for r in rows:
        writer.writerow([
            r.get("first_name") or "",
            r.get("last_name") or "",
            r.get("email") or "",
            r.get("title") or "",
            r.get("website") or "",
            r.get("company_name") or "",
            r.get("revenue") or "",
            r.get("linkedin_url") or "",
            r.get("industry") or "",
            r.get("city") or "",
            r.get("state") or "",
            r.get("country_code") or "",
            r.get("country") or "",
            r.get("status") or "pending"
        ])
        
    output.seek(0)
    filename = f"leads_data_dump_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


@router.get("/template")
async def download_sample_template():
    """Returns a sample CSV with the exact redesigned segment headers and representative data."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "First Name",
        "Last Name",
        "Mail ID",
        "Title / Designation",
        "Company Website",
        "Company Name",
        "Revenue",
        "Person's LinkedIn URL",
        "Industry",
        "City",
        "State",
        "Country Code",
        "Country Name"
    ])
    writer.writerow([
        "John",
        "Doe",
        "john.doe@techscale.io",
        "VP of Sales",
        "https://techscale.io",
        "TechScale Inc",
        "$25M",
        "https://linkedin.com/in/johndoe",
        "Software",
        "San Francisco",
        "California",
        "US",
        "United States"
    ])
    writer.writerow([
        "Jane",
        "Smith",
        "jane.smith@apexsolutions.com",
        "Chief Technology Officer",
        "https://apexsolutions.com",
        "Apex Solutions",
        "$50M",
        "https://linkedin.com/in/janesmith",
        "Information Technology",
        "London",
        "Greater London",
        "GB",
        "United Kingdom"
    ])
    output.seek(0)
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=leads_data_dump_template.csv"
        }
    )


# ─── List recipients ──────────────────────────────────────────────────────────

class RecipientCreateRequest(BaseModel):
    email: str
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    alternative_email: Optional[str] = None
    order_id: Optional[str] = None
    title: Optional[str] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    company_name: Optional[str] = None
    website: Optional[str] = None
    revenue: Optional[str] = None
    linkedin_url: Optional[str] = None
    linkedin_id: Optional[str] = None
    industry: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country_code: Optional[str] = None
    zip_code: Optional[str] = None
    pin_code: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None
    campaign_id: Optional[str] = None

@router.post("/recipients", response_model=schemas.Recipient)
async def create_recipient(req: RecipientCreateRequest):
    if req.campaign_id:
        existing = await models.Recipient.find_one(email=req.email, campaign_id=req.campaign_id)
    else:
        existing = await models.Recipient.find_one(email=req.email, campaign_id=None)
        
    if existing:
        raise HTTPException(status_code=400, detail="A lead with this email address already exists in this campaign.")
        
    recipient = models.Recipient(
        email=req.email,
        name=req.name or f"{req.first_name or ''} {req.last_name or ''}".strip() or None,
        first_name=req.first_name,
        last_name=req.last_name,
        alternative_email=req.alternative_email,
        order_id=req.order_id,
        title=req.title or req.designation,
        department=req.department,
        company_name=req.company_name,
        website=req.website,
        revenue=req.revenue,
        linkedin_url=req.linkedin_url or req.linkedin_id,
        industry=req.industry,
        city=req.city,
        state=req.state,
        country_code=req.country_code,
        zip_code=req.zip_code or req.pin_code,
        country=req.country,
        region=req.region or ", ".join(filter(None, [req.city, req.state, req.country])) or None,
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
    
    if not campaign_ids and user.role != "admin":
        return []

    # Convert string IDs to UUID objects
    from uuid import UUID
    uuid_campaign_ids = []
    for cid in campaign_ids:
        try:
            uuid_campaign_ids.append(UUID(cid))
        except ValueError:
            pass

    from app.database import db_pool
    if not db_pool:
        raise HTTPException(status_code=500, detail="Database not initialized")

    async with db_pool.acquire() as conn:
        if project_id or user.role != "admin":
            if not uuid_campaign_ids:
                return []
            rows = await conn.fetch(
                "SELECT * FROM public.recipients WHERE campaign_id = ANY($1) ORDER BY created_at DESC",
                uuid_campaign_ids
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM public.recipients ORDER BY created_at DESC"
            )

    return [models.Recipient.from_row(r) for r in rows]


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
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS follow_up_templates JSONB DEFAULT '[]'::jsonb;
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS follow_up_subjects JSONB DEFAULT '[]'::jsonb;
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
                    ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS revenue VARCHAR(255);
                    ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS country_code VARCHAR(50);
                    ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS city VARCHAR(255);
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
    thread_history = []

    def format_template(tpl: str) -> str:
        if not tpl:
            return ""
        return (
            tpl
            .replace("{{name}}", recipient_name).replace("{name}", recipient_name)
            .replace("{{first_name}}", recipient.first_name or "").replace("{first_name}", recipient.first_name or "")
            .replace("{{last_name}}", recipient.last_name or "").replace("{last_name}", recipient.last_name or "")
            .replace("{{email}}", recipient.email).replace("{email}", recipient.email)
            .replace("{{title}}", recipient.title or "").replace("{title}", recipient.title or "")
            .replace("{{designation}}", recipient.title or "").replace("{designation}", recipient.title or "")
            .replace("{{department}}", recipient.department or "").replace("{department}", recipient.department or "")
            .replace("{{industry}}", recipient.industry or "").replace("{industry}", recipient.industry or "")
            .replace("{{region}}", recipient.region or "").replace("{region}", recipient.region or "")
            .replace("{{company_name}}", recipient.company_name or "").replace("{company_name}", recipient.company_name or "")
            .replace("{{company}}", recipient.company_name or "").replace("{company}", recipient.company_name or "")
            .replace("{{revenue}}", recipient.revenue or "").replace("{revenue}", recipient.revenue or "")
            .replace("{{city}}", recipient.city or "").replace("{city}", recipient.city or "")
            .replace("{{state}}", recipient.state or "").replace("{state}", recipient.state or "")
            .replace("{{country_code}}", recipient.country_code or "").replace("{country_code}", recipient.country_code or "")
            .replace("{{country}}", recipient.country or "").replace("{country}", recipient.country or "")
            .replace("{{website}}", recipient.website or "").replace("{website}", recipient.website or "")
        )

    if not is_follow_up:
        mail_type = "Initial Mail"
        subject = format_template(subject_tpl)
        body = format_template(body_tpl)
    else:
        next_count = recipient.follow_up_count + 1
        mail_type = f"Follow-up {next_count}"
        
        subject_raw = f"Re: {subject_tpl}"
        subject = format_template(subject_raw)
        
        body_raw = None
        if campaign.follow_up_templates and len(campaign.follow_up_templates) > next_count:
            body_raw = campaign.follow_up_templates[next_count]
        if not body_raw:
            body_raw = (
                f"Hi {recipient_name},\n\n"
                f"Just following up on my previous message regarding {campaign.name}. "
                f"I wanted to quickly check back and see if you had any thoughts or questions!\n\n"
                f"Best regards,\n"
                f"{sender_name}"
            )
        body = format_template(body_raw)

        # 1. Initial Mail was sent at recipient.send_at
        init_subject = format_template(subject_tpl)
        init_body = format_template(body_tpl)
        thread_history.append({
            "mail_type": "Initial Mail",
            "subject": init_subject,
            "body": init_body,
            "sent_at": recipient.send_at.isoformat() if recipient.send_at else None
        })
        
        # 2. Add sent follow-ups
        for i in range(1, recipient.follow_up_count + 1):
            fu_subject = f"Re: {init_subject}" if not init_subject.lower().startswith("re:") else init_subject
            fu_body_raw = None
            if campaign.follow_up_templates and len(campaign.follow_up_templates) > i:
                fu_body_raw = campaign.follow_up_templates[i]
            if not fu_body_raw:
                fu_body_raw = (
                    f"Hi {recipient_name},\n\n"
                    f"Just following up on my previous message regarding {campaign.name}. "
                    f"I wanted to quickly check back and see if you had any thoughts or questions!\n\n"
                    f"Best regards,\n"
                    f"{sender_name}"
                )
            fu_body = format_template(fu_body_raw)
            sent_time = recipient.last_sent_at if i == recipient.follow_up_count else recipient.send_at
            thread_history.append({
                "mail_type": f"Follow-up {i}",
                "subject": fu_subject,
                "body": fu_body,
                "sent_at": sent_time.isoformat() if sent_time else None
            })

    return {
        "recipient_id": recipient_id,
        "subject": subject,
        "body": body,
        "mail_type": mail_type,
        "thread_history": thread_history
    }
