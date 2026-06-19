import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

import asyncio
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import app.database as db_mod
from app.email_service import fetch_inbox
from app.models import EmailConfig

async def main():
    await db_mod.init_db()
    async with db_mod.db_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM public.email_configs WHERE is_active = True LIMIT 1;")
        if not row:
            print("No active email config found in database!")
            return
        
        config = EmailConfig.from_row(row)
        print("Config name:", config.name)
        print("Sender address:", config.sender_address)
        print("IMAP Host:", config.imap.host if config.imap else "None")
        print("IMAP Username:", config.imap.username if config.imap else "None")
        
        print("\nAttempting to connect to IMAP...")
        try:
            msgs = await fetch_inbox(config, limit=5)
            print(f"Success! Fetched {len(msgs)} messages:")
            for m in msgs:
                print("- Subject:", m.subject, "From:", m.from_addr)
        except Exception as e:
            print("IMAP fetch failed with exception:")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
