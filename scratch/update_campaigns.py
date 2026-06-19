import asyncio
import os
import sys
from datetime import datetime, timezone

# Add backend directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))

# Load dotenv before importing app.database
from dotenv import load_dotenv
backend_dir = os.path.join(os.path.dirname(__file__), "..", "backend")
load_dotenv(os.path.join(backend_dir, ".env"))

from app.database import init_db, db_pool
import asyncpg

async def update_campaigns():
    try:
        await init_db()
    except Exception as e:
        print("Exception in init_db:", e)

    global db_pool
    if not db_pool:
        print("db_pool is None, trying manual connection pool creation...")
        try:
            db_pool = await asyncpg.create_pool(
                os.getenv("DATABASE_URL"),
                min_size=2,
                max_size=10,
                command_timeout=60
            )
        except Exception as ex:
            print("Manual pool creation failed:", ex)
            return

    # List of campaigns to target
    target_campaign_names = ["digio ", "Test", "jeff digio"]
    # 10:00 AM IST on June 20, 2026 is 04:30 AM UTC
    target_time_utc = datetime(2026, 6, 20, 4, 30, 0, tzinfo=timezone.utc)

    print("\nFetching campaigns before update:")
    async with db_pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, name, schedule, status, send_at, timezone, target_region FROM campaigns")
        for row in rows:
            print(f"- ID: {row['id']} | Name: {row['name']} | Schedule: {row['schedule']} | Status: {row['status']} | Send At: {row['send_at']} | Timezone: {row['timezone']} | Region: {row['target_region']}")

    print("\nUpdating campaign schedules...")
    async with db_pool.acquire() as conn:
        for name in target_campaign_names:
            result = await conn.execute(
                "UPDATE campaigns SET send_at = $1, status = 'active' WHERE TRIM(name) = TRIM($2)",
                target_time_utc, name
            )
            print(f"Updated '{name}': {result}")

    print("\nFetching campaigns after update:")
    async with db_pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, name, schedule, status, send_at, timezone, target_region FROM campaigns")
        for row in rows:
            # Format send_at to Indian Standard Time (IST) for easy verification
            send_at_dt = row['send_at']
            ist_time_str = "N/A"
            if send_at_dt:
                try:
                    # Convert to IST (UTC + 5:30)
                    from datetime import timedelta
                    dt_ist = send_at_dt.astimezone(timezone(timedelta(hours=5, minutes=30)))
                    ist_time_str = dt_ist.strftime("%Y-%m-%d %I:%M %p IST")
                except Exception as e:
                    ist_time_str = f"Error converting: {e}"
            print(f"- ID: {row['id']} | Name: {row['name']} | Schedule: {row['schedule']} | Status: {row['status']} | UTC Send At: {row['send_at']} | IST Send At: {ist_time_str}")

if __name__ == "__main__":
    asyncio.run(update_campaigns())
