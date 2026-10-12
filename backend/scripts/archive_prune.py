"""
archive_prune.py
~~~~~~~~~~~~~~~~
Zero-downtime database archival and pruning script.
- Gzips contacts older than `retention_months` to a compressed JSON archive.
- Drops/deletes historical records to free up disk space without locks.

Usage:
    python -m scripts.archive_prune --retention-months 6
    python -m scripts.archive_prune --dry-run
"""
import os
import sys
import asyncio
import argparse
import gzip
import json
from datetime import datetime, timezone, timedelta

# Ensure parent directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import init_db, close_db, db_pool


async def archive_and_prune(retention_months: int = 6, dry_run: bool = False, output_dir: str = "archives"):
    await init_db()
    if not db_pool:
        print("❌ Database connection failed.")
        return

    cutoff_date = datetime.now(timezone.utc) - timedelta(days=retention_months * 30)
    print(f"🧹 Archival cutoff date: {cutoff_date.isoformat()} (Retention: {retention_months} months)")

    async with db_pool.acquire() as conn:
        # Check count of eligible recipients
        count = await conn.fetchval(
            "SELECT count(*) FROM public.recipients WHERE created_at < $1",
            cutoff_date
        )
        print(f"📊 Found {count} records older than {retention_months} months.")

        if count == 0:
            print("✅ No records require pruning.")
            await close_db()
            return

        if dry_run:
            print("🔍 [DRY RUN] Would archive and delete %d records. Exiting without modifying data." % count)
            await close_db()
            return

        os.makedirs(output_dir, exist_ok=True)
        archive_filename = f"recipients_archive_before_{cutoff_date.strftime('%Y%m%d')}.json.gz"
        archive_path = os.path.join(output_dir, archive_filename)

        print(f"📦 Exporting records to compressed archive: {archive_path}...")
        rows = await conn.fetch(
            "SELECT * FROM public.recipients WHERE created_at < $1",
            cutoff_date
        )

        records = [dict(r) for r in rows]
        # Convert non-serializable objects (UUID, datetime)
        for r in records:
            for k, v in list(r.items()):
                if hasattr(v, "isoformat"):
                    r[k] = v.isoformat()
                elif hasattr(v, "hex"):
                    r[k] = str(v)

        with gzip.open(archive_path, "wt", encoding="utf-8") as gz:
            json.dump(records, gz, indent=2)

        archive_size_mb = os.path.getsize(archive_path) / (1024 * 1024)
        print(f"✅ Archive saved successfully ({archive_size_mb:.2f} MB).")

        print("🗑️ Pruning archived records from database...")
        deleted = await conn.execute(
            "DELETE FROM public.recipients WHERE created_at < $1",
            cutoff_date
        )
        print(f"✅ Pruning complete: {deleted}. Database reclaimed storage.")

    await close_db()


def main():
    parser = argparse.ArgumentParser(description="Prune and archive old recipient records")
    parser.add_argument("--retention-months", type=int, default=6, help="Months of data to retain (default: 6)")
    parser.add_argument("--dry-run", action="store_true", help="Inspect eligible records without deleting")
    parser.add_argument("--output-dir", type=str, default="archives", help="Directory to save gzipped archives")
    args = parser.parse_args()

    asyncio.run(archive_and_prune(args.retention_months, args.dry_run, args.output_dir))


if __name__ == "__main__":
    main()
