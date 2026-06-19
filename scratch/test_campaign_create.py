import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
os.environ["DATABASE_URL"] = "postgresql://postgres:Dandothkar1998@email-saas-db:5432/postgres"
import asyncio
import traceback
from app import models, database, schemas

async def main():
    print("Initializing DB...")
    await database.init_db()
    
    try:
        print("Testing models.Campaign instantiation and insertion...")
        # Simulate what schemas.CampaignCreate receives
        payload = schemas.CampaignCreate(
            name="Test Campaign 123",
            target_segment="Startups",
            schedule="Once",
            subject="Hello World",
            body_template="Hi {name}, test body",
            send_at=None,
            email_config_id=""  # Emulate frontend empty string input
        )
        
        email_config_id = payload.email_config_id
        if email_config_id == "":
            email_config_id = None
            
        print(f"email_config_id: {email_config_id}")
        
        campaign = models.Campaign(
            name=payload.name,
            target_segment=payload.target_segment,
            schedule=payload.schedule,
            subject=payload.subject,
            body_template=payload.body_template,
            send_at=payload.send_at,
            timezone="America/New_York",
            email_config_id=email_config_id,
            status="draft",
        )
        
        print("Inserting campaign...")
        await campaign.insert()
        print("SUCCESSFULLY INSERTED CAMPAIGN!")
        print("Campaign ID:", campaign.id)
    except Exception as e:
        print("CAMPAIGN CREATION ERROR:")
        traceback.print_exc()
    finally:
        await database.close_db()

if __name__ == "__main__":
    asyncio.run(main())
