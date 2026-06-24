import asyncio
import os
from dotenv import load_dotenv

# Load env variables from backend directory
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "backend", ".env")
load_dotenv(env_path)

from app.database import init_db, db_pool
from app.models import User

async def main():
    await init_db()
    if not db_pool:
        print("Failed to initialize database pool.")
        return
    
    async with db_pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, email, is_verified, role FROM public.profiles")
        print("Users in database:")
        for r in rows:
            print(dict(r))

if __name__ == "__main__":
    asyncio.run(main())
