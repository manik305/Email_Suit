import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

os.environ["DATABASE_URL"] = "postgresql://postgres:Dandothkar1998@127.0.0.1:5432/postgres"

import asyncio
import pandas as pd
import io
from app import models, database

async def main():
    # Force DATABASE_URL to localhost for running on the host
    os.environ["DATABASE_URL"] = "postgresql://postgres:Dandothkar1998@127.0.0.1:5432/postgres"
    
    print("Initializing DB...")
    await database.init_db()
    
    # Create sample CSV content
    csv_content = """first name,last name,mail id,alternative mail id,title,department,company name,website,linkedin id,industry,state,pin code,country
John,Doe,john@example.com,alt@example.com,Manager,IT,Test Co,test.com,linkedin.com/in/john,Tech,NY,10001,USA
"""
    df = pd.read_csv(io.StringIO(csv_content))
    
    # 2. Strict Header Validation
    original_headers = [str(c) for c in df.columns]
    normalized_headers = [c.strip().lower() for c in original_headers]
    df.columns = normalized_headers
    
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
                
            print(f"Finding recipient: {email}")
            existing = await models.Recipient.find_one(email=email)
            if not existing:
                print("Inserting new recipient...")
                recipient = models.Recipient(
                    email=email,
                    name=name,
                    first_name=first_name,
                    last_name=last_name,
                    alternative_email=alt_email,
                    designation=title,
                    department=dept,
                    company_name=company,
                    website=web,
                    linkedin_id=linkedin,
                    industry=ind,
                    state=st,
                    pin_code=pin,
                    country=ctry,
                    region=region,
                    status="pending"
                )
                await recipient.insert()
                print("Insertion completed successfully!")
                count += 1
            else:
                print("Updating existing recipient...")
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
                print("Update completed successfully!")
                count += 1
                
        print(f"Processing finished. Rows added/updated: {count}")
    except Exception as e:
        print("Error encountered:")
        import traceback
        traceback.print_exc()
    finally:
        await database.close_db()

if __name__ == "__main__":
    asyncio.run(main())
