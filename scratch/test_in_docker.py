import asyncio
import traceback
from app import database, models

async def main():
    print("Initializing DB...")
    await database.init_db()
    try:
        print("Inserting new recipient...")
        recipient = models.Recipient(
            email='test_docker@example.com',
            name='Docker Test',
            first_name='Docker',
            last_name='Test',
            alternative_email='alt_docker@example.com',
            title='Manager',
            department='IT',
            company_name='Docker Co',
            website='docker.com',
            linkedin_url='docker-li',
            industry='Tech',
            state='NY',
            zip_code='10001',
            country='USA',
            region='East',
            status='pending'
        )
        await recipient.insert()
        print("SUCCESSFULLY INSERTED!")
    except Exception as e:
        print("ERROR:")
        traceback.print_exc()
    finally:
        await database.close_db()

if __name__ == "__main__":
    asyncio.run(main())
