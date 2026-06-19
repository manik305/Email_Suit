import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

import asyncio
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import app.database as db_mod

async def main():
    await db_mod.init_db()
    async with db_mod.db_pool.acquire() as conn:
        configs = await conn.fetch("SELECT id, name, sender_address, smtp_username, imap_username, is_active FROM public.email_configs;")
        print("EMAIL CONFIGS:")
        for c in configs:
            print(dict(c))
        
        campaigns = await conn.fetch("SELECT id, name, email_config_id FROM public.campaigns;")
        print("\nCAMPAIGNS:")
        for camp in campaigns:
            print(dict(camp))

if __name__ == "__main__":
    asyncio.run(main())
