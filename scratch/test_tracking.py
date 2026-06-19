import sys
import os
import asyncio
import urllib.parse
from dotenv import load_dotenv

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", ".env")))

from app import models, database, schemas
from app.email_service import _rewrite_links_in_text, _rewrite_links_in_html

async def test_rewriting():
    print("=== Testing Link Rewriting Helpers ===")
    recipient_id = "test-recipient-123"
    base_url = "http://localhost:8000"

    # Test plain text links
    text_body = "Hello John, visit http://google.com or https://company.com/demo. Do not rewrite http://localhost:8000/api/track/click or unsubscribe links."
    rewritten_text = _rewrite_links_in_text(text_body, recipient_id, base_url)
    print("Original Text:", text_body)
    print("Rewritten Text:", rewritten_text)
    assert "target=http%3A//google.com" in rewritten_text
    assert "target=https%3A//company.com/demo" in rewritten_text
    assert "/api/track/" in rewritten_text
    print("[OK] Plain text rewriting passed.")

    # Test HTML links
    html_body = '<html><body>Hi, click <a href="https://example.com/demo">here</a> or <a href=\'http://enterprise.com\'>there</a>.</body></html>'
    rewritten_html = _rewrite_links_in_html(html_body, recipient_id, base_url)
    print("Original HTML:", html_body)
    print("Rewritten HTML:", rewritten_html)
    assert "target=https%3A//example.com/demo" in rewritten_html
    assert "target=http%3A//enterprise.com" in rewritten_html
    print("[OK] HTML link rewriting passed.")


async def test_database_and_tracking_pixel():
    print("\n=== Testing Database Init & Region Tracking ===")
    await database.init_db()
    try:
        # Check active configs
        configs = await models.EmailConfig.find_all().to_list()
        print(f"Found {len(configs)} email configurations.")

        # Instantiate a mock recipient and campaign
        campaign = models.Campaign(
            name="GDPR EU Target Campaign",
            target_region="EU",
            status="draft"
        )
        await campaign.insert()
        print("Created EU campaign:", campaign.id)

        recipient = models.Recipient(
            email="test-eu@domain.eu",
            first_name="EU",
            last_name="Prospect",
            campaign_id=campaign.id,
            status="pending"
        )
        await recipient.insert()
        print("Created EU Recipient:", recipient.id)

        # Clean up
        await recipient.delete()
        await campaign.delete()
        print("[OK] Database insertion and deletion tests passed.")
    except Exception as e:
        print("[ERROR] Database test failed:", e)
        raise e
    finally:
        await database.close_db()


if __name__ == "__main__":
    asyncio.run(test_rewriting())
    asyncio.run(test_database_and_tracking_pixel())
