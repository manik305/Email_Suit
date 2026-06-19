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
from fastapi import APIRouter, UploadFile, File, HTTPException, Body
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

@router.get("/recipients", response_model=List[schemas.Recipient])
async def list_recipients():
    return await models.Recipient.find_all().sort("-created_at").to_list()


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
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS follow_up_templates JSONB;
                """)
                
            return {"status": "success", "detail": "Database dropped and reset successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database reset failed: {str(e)}")
