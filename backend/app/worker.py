"""
worker.py
~~~~~~~~~
Standalone background worker runner for the outreach campaign dispatcher.
Can be executed as an independent microservice container:
    python -m app.worker
or triggered via standard Docker compose worker services.
"""
import sys
import os
import asyncio
import logging
import signal

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from app.database import init_db, close_db
from app.scheduler import _run_scheduled_campaigns

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] (Worker) %(message)s"
)
logger = logging.getLogger("email_worker")

_running = True

def handle_stop(signum, frame):
    global _running
    logger.info("Termination signal received. Shutting down worker gracefully...")
    _running = False

async def main():
    global _running
    logger.info("🚀 Starting Email Suit Outbound Dispatch Worker microservice...")
    await init_db()

    poll_interval = int(os.getenv("WORKER_POLL_INTERVAL_SECONDS", "30"))
    logger.info("Worker initialized. Heartbeat cadence: %d seconds.", poll_interval)

    while _running:
        try:
            logger.info("Checking scheduled campaigns and pending outbound queues...")
            await _run_scheduled_campaigns()
        except Exception as exc:
            logger.error("Error during scheduled campaign dispatch cycle: %s", exc, exc_info=True)
        
        # Non-blocking sleep with quick cancellation
        for _ in range(poll_interval):
            if not _running:
                break
            await asyncio.sleep(1)

    logger.info("Closing database connection pool...")
    await close_db()
    logger.info("Worker stopped cleanly.")

if __name__ == "__main__":
    signal.signal(signal.SIGINT, handle_stop)
    signal.signal(signal.SIGTERM, handle_stop)
    asyncio.run(main())
