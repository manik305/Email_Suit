"""
scheduler.py
~~~~~~~~~~~~
APScheduler-based job that fires campaign sends at their `send_at` time.

The scheduler polls every 60 seconds, finds campaigns with:
  - status = "draft" or "active"
  - send_at <= now (UTC)
  - email_config_id set

…and triggers the SMTP batch send.
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


def calculate_next_send_at(current_send_at_str: str, schedule: str, tz_name: str, target_region: str = "US") -> str | None:
    """Calculate the next send_at time. For Daily schedules, automatically schedules for 10:00 AM IST (2:00 AM IST for APAC)."""
    if not schedule or schedule == "Once":
        return None
        
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    
    if schedule == "Daily":
        is_apac = (target_region == "APAC") or (tz_name and "Australia" in tz_name) or (tz_name and any(zone in tz_name for zone in ["Tokyo", "Seoul", "Singapore", "Hong_Kong", "Taipei", "Manila", "Kuala_Lumpur", "Shanghai", "Jakarta", "Bangkok"]))
        if is_apac:
            # 2:00 AM IST -> 20:30 UTC of previous day relative to local date
            target_time = now.replace(hour=20, minute=30, second=0, microsecond=0)
            if now >= target_time:
                target_time += timedelta(days=1)
            return target_time.isoformat()
        else:
            # 10:00 AM IST -> 04:30 UTC
            target_time = now.replace(hour=4, minute=30, second=0, microsecond=0)
            if now >= target_time:
                target_time += timedelta(days=1)
            return target_time.isoformat()
            
    elif schedule == "Weekly":
        try:
            dt = datetime.fromisoformat(current_send_at_str.replace("Z", "+00:00"))
            return (dt + timedelta(days=7)).isoformat()
        except Exception:
            return (now + timedelta(days=7)).isoformat()
            
    elif schedule == "Monthly":
        try:
            dt = datetime.fromisoformat(current_send_at_str.replace("Z", "+00:00"))
            return (dt + timedelta(days=30)).isoformat()
        except Exception:
            return (now + timedelta(days=30)).isoformat()
            
    return None


def calculate_next_follow_up(campaign, days: int = 1) -> datetime:
    """Calculate the next follow-up datetime matching the campaign's target timezone and time of day."""
    now = datetime.now(timezone.utc)
    tz_name = campaign.timezone or "America/New_York"
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("America/New_York")
        
    target_hour = 9
    target_minute = 0
    target_second = 0
    
    if campaign.send_at:
        try:
            send_dt = datetime.fromisoformat(campaign.send_at.replace("Z", "+00:00")).astimezone(tz)
            target_hour = send_dt.hour
            target_minute = send_dt.minute
            target_second = send_dt.second
        except Exception:
            pass
    else:
        local_now = now.astimezone(tz)
        target_hour = local_now.hour
        target_minute = local_now.minute
        target_second = local_now.second

    local_start = now.astimezone(tz)
    current_date = local_start
    added = 0
    while added < days:
        current_date += timedelta(days=1)
        if current_date.weekday() < 5:  # Monday to Friday
            added += 1
            
    next_follow_up_local = current_date.replace(
        hour=target_hour,
        minute=target_minute,
        second=target_second,
        microsecond=0
    )
    return next_follow_up_local.astimezone(timezone.utc)


async def _run_scheduled_campaigns() -> None:
    """Check for campaigns that are due and fire SMTP sends."""
    from .models import Campaign, Recipient, EmailConfig
    from .email_service import send_email

    now_iso = datetime.now(timezone.utc).isoformat()

    # Find all campaigns and filter locally to avoid Beanie operators
    all_campaigns = await Campaign.find().to_list()
    candidates = [
        c for c in all_campaigns 
        if c.status in ["draft", "active"] and c.send_at and c.email_config_id
    ]

    for campaign in candidates:
        if not campaign.send_at:
            continue
        try:
            # Parse send_at — accept naive ISO string (treat as UTC)
            send_dt_str = campaign.send_at.replace("Z", "+00:00")
            send_dt = datetime.fromisoformat(send_dt_str)
            if send_dt.tzinfo is None:
                send_dt = send_dt.replace(tzinfo=timezone.utc)
        except ValueError:
            logger.warning("Campaign %s has invalid send_at: %s", campaign.id, campaign.send_at)
            continue

        if send_dt > datetime.now(timezone.utc):
            continue  # not due yet

        # Load email config
        try:
            config = await EmailConfig.get(campaign.email_config_id)
        except Exception:
            config = None
        if not config:
            logger.warning("Campaign %s: EmailConfig %s not found, skipping.", campaign.id, campaign.email_config_id)
            continue

        # Load pending recipients
        all_recipients = await Recipient.find(campaign_id=str(campaign.id)).to_list()
        recipients = [r for r in all_recipients if r.status == "pending"]

        if not recipients:
            logger.info("Campaign %s: no pending recipients, rescheduling next run.", campaign.id)
            if campaign.schedule in ["Daily", "Weekly", "Monthly"]:
                next_send_at = calculate_next_send_at(campaign.send_at, campaign.schedule, campaign.timezone, campaign.target_region)
                await campaign.update({"send_at": next_send_at})
            else:
                await campaign.update({"status": "completed", "send_at": None})
            continue

        subject = campaign.subject or f"Message from {config.sender_name or config.sender_address}"
        body_tpl = campaign.body_template or "Hi {name},\n\nThis is an outreach from our team.\n\nBest regards"

        # Calculate max follow-ups based on saved follow-up templates list
        max_fu = 4
        if campaign.follow_up_templates:
            max_fu = max(1, len(campaign.follow_up_templates) - 1)

        sent, failed = 0, 0
        for r in recipients:
            recipient_name = r.name or (f"{r.first_name} {r.last_name}" if r.first_name or r.last_name else "there")
            body = (
                body_tpl
                .replace("{name}", recipient_name)
                .replace("{email}", r.email)
                .replace("{designation}", r.title or "")
                .replace("{department}", r.department or "")
                .replace("{industry}", r.industry or "")
                .replace("{region}", r.region or "")
            )
            try:
                await send_email(config=config, to_address=r.email, subject=subject, body=body, recipient_id=str(r.id))
                next_time = calculate_next_follow_up(campaign, 1)
                await r.update({
                    "status": "sent",
                    "max_follow_ups": max_fu,
                    "follow_up_count": 0,
                    "next_follow_up_at": next_time
                })
                sent += 1
            except Exception as exc:
                logger.error("Failed sending to %s: %s", r.email, exc)
                await r.update({
                    "status": "bounced",
                    "max_follow_ups": 0,
                    "next_follow_up_at": None
                })
                failed += 1

        # Clear send_at so it doesn't re-fire; mark active/completed
        if campaign.schedule in ["Daily", "Weekly", "Monthly"]:
            next_send_at = calculate_next_send_at(campaign.send_at, campaign.schedule, campaign.timezone, campaign.target_region)
            await campaign.update({"status": "active", "send_at": next_send_at})
        else:
            await campaign.update({"status": "completed", "send_at": None})
        logger.info(
            "✅ Scheduled send for campaign '%s': sent=%d failed=%d",
            campaign.name, sent, failed
        )


def _add_business_days(start_date: datetime, days: int) -> datetime:
    """Add business days to start_date, skipping Saturday and Sunday."""
    current_date = start_date
    added = 0
    while added < days:
        current_date += timedelta(days=1)
        if current_date.weekday() < 5:  # Monday to Friday
            added += 1
    return current_date


async def _run_follow_ups() -> None:
    """Scan for active recipients due for their next automated follow-up."""
    from .models import Campaign, Recipient, EmailConfig
    from .email_service import send_email

    now = datetime.now(timezone.utc)

    # Find recipients whose follow-up is due
    all_recipients = await Recipient.find().to_list()
    due_recipients = []
    for r in all_recipients:
        if r.next_follow_up_at:
            ref = r.next_follow_up_at
            if ref.tzinfo is None:
                ref = ref.replace(tzinfo=timezone.utc)
            if ref <= now:
                due_recipients.append(r)

    for r in due_recipients:
        # Abort follow-ups if they replied or bounced in the meantime
        if r.status in ["bounced", "replied"]:
            await r.update({
                "next_follow_up_at": None,
                "max_follow_ups": 0
            })
            continue

        try:
            campaign = await Campaign.get(r.campaign_id)
        except Exception:
            campaign = None

        if not campaign:
            await r.update({"next_follow_up_at": None})
            continue

        try:
            config = await EmailConfig.get(campaign.email_config_id)
        except Exception:
            config = None

        if not config:
            logger.warning("Recipient %s follow-up skipped: config not found.", r.email)
            continue

        # Build dynamic, friendly follow-up thread context
        next_count = r.follow_up_count + 1
        subject = f"Re: {campaign.subject or 'Our outreach'}"
        recipient_name = r.name or (f"{r.first_name} {r.last_name}" if r.first_name or r.last_name else "there")
        
        # Load custom follow-up body template if exists
        body = None
        if campaign.follow_up_templates and len(campaign.follow_up_templates) > next_count:
            body = campaign.follow_up_templates[next_count]
            
        if not body:
            # Fallback to default
            body = (
                f"Hi {recipient_name},\n\n"
                f"Just following up on my previous message regarding {campaign.name}. "
                f"I wanted to quickly check back and see if you had any thoughts or questions!\n\n"
                f"Best regards,\n"
                f"{config.sender_name or config.sender_address}"
            )
        else:
            # Perform tokens replacement on custom template
            body = (
                body
                .replace("{name}", recipient_name)
                .replace("{email}", r.email)
                .replace("{designation}", r.title or "")
                .replace("{department}", r.department or "")
                .replace("{industry}", r.industry or "")
                .replace("{region}", r.region or "")
                .replace("{company_name}", r.company_name or "")
                .replace("{company}", r.company_name or "")
            )

        try:
            await send_email(config=config, to_address=r.email, subject=subject, body=body, recipient_id=str(r.id))
            
            # Check if all follow-ups are completed
            if next_count >= r.max_follow_ups:
                await r.update({
                    "follow_up_count": next_count,
                    "next_follow_up_at": None
                })
                logger.info("🎯 Completed all follow-ups for recipient %s", r.email)
            else:
                next_time = calculate_next_follow_up(campaign, 1)
                await r.update({
                    "follow_up_count": next_count,
                    "next_follow_up_at": next_time
                })
                logger.info("✉️ Sent follow-up #%d to %s. Next scheduled at %s", next_count, r.email, next_time)
        except Exception as exc:
            logger.error("Failed to send follow-up to %s: %s", r.email, exc)
            # Cancel future follow-ups and mark as bounced
            await r.update({
                "status": "bounced",
                "next_follow_up_at": None,
                "max_follow_ups": 0
            })


def start_scheduler() -> None:
    global _scheduler
    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(
        _run_scheduled_campaigns,
        trigger="interval",
        seconds=60,
        id="campaign_scheduler",
        replace_existing=True,
    )
    _scheduler.add_job(
        _run_follow_ups,
        trigger="interval",
        seconds=60,
        id="follow_up_scheduler",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("📅 Campaign scheduler started (polls every 60s)")


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Campaign scheduler stopped")
