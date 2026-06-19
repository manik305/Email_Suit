import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

import asyncio
from app import models

async def main():
    print("Testing Recipient instantiation...")
    try:
        recipient = models.Recipient(
            email="test@example.com",
            name="Test Name",
            first_name="Test",
            last_name="Name",
            alternative_email="alt@example.com",
            designation="Manager",
            department="IT",
            company_name="Test Co",
            website="test.com",
            linkedin_id="test-li",
            industry="Tech",
            state="NY",
            pin_code="10001",
            country="USA",
            region="East",
            status="pending"
        )
        print("Instantiation succeeded!")
        print("title:", recipient.title)
        print("zip_code:", recipient.zip_code)
        print("linkedin_url:", recipient.linkedin_url)
    except Exception as e:
        print("Instantiation failed with error:", e)
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
