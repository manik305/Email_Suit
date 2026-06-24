import asyncio
import os
from dotenv import load_dotenv

# Load env
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

async def query_users():
    import asyncpg
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))
    rows = await conn.fetch("SELECT email, otp, otp_expires_at FROM public.profiles")
    for r in rows:
        print("User:", r["email"], "OTP:", r["otp"], "Expires:", r["otp_expires_at"], "Type:", type(r["otp_expires_at"]))
    await conn.close()

if __name__ == "__main__":
    asyncio.run(query_users())
