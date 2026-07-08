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
import collections
import random
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import Optional, Dict, Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


def calculate_next_send_at(current_send_at_str: Optional[str], schedule: str, tz_name: Optional[str], target_region: str = "US") -> Optional[str]:
    """Calculate the next send_at time. For Daily schedules, automatically schedules for 10:00 AM IST (2:00 AM IST for APAC)."""
    if not schedule or schedule == "Once":
        return None
        
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


def _add_business_days(start_date: datetime, days: int) -> datetime:
    """Add business days to start_date, skipping Saturday and Sunday."""
    current_date = start_date
    added = 0
    while added < days:
        current_date += timedelta(days=1)
        if current_date.weekday() < 5:  # Monday to Friday
            added += 1
    return current_date


def get_timezone_from_state(state: Optional[str]) -> str:
    """Map a US state code to its timezone abbreviation (EST, CST, MST, PST)."""
    if not state:
        return "UNKNOWN"
    s = state.strip().upper()
    est_states = {'NY', 'FL', 'GA', 'MA', 'PA', 'OH', 'MI', 'NC', 'SC', 'VA', 'NJ', 'EST'}
    cst_states = {'TX', 'IL', 'TN', 'MO', 'AL', 'LA', 'WI', 'MN', 'CST'}
    mst_states = {'CO', 'AZ', 'UT', 'NM', 'WY', 'MT', 'ID', 'MST'}
    pst_states = {'CA', 'WA', 'OR', 'NV', 'PST'}
    if s in est_states:
        return 'EST'
    if s in cst_states:
        return 'CST'
    if s in mst_states:
        return 'MST'
    if s in pst_states:
        return 'PST'
    return 'UNKNOWN'


def is_block_or_auth_error(exc: Exception) -> bool:
    """Check if the smtplib exception is due to spam block, reputation limit, or auth failure."""
    err_str = str(exc).lower()
    if "authentication failed" in err_str or "login failed" in err_str or "smtpauthenticationerror" in err_str or "credentials" in err_str:
        return True
    block_patterns = [
        # Generic SMTP errors
        "spam block", "blocked", "554 5.7.1", "550 blocked", "reputation",
        "spam", "suspicious activity", "blacklisted", "unauthorized", "refused",
        # smtp-relay.gmail.com specific throttle / quota errors
        "421 4.7.0",
        "550 5.7.1",
        "421 too many connections",
        "4.7.0 try again later",
        "daily user sending quota",
        "relay access denied",
        "quota exceeded",
        "temporarily deferred",
        "rate limit",
    ]
    if any(p in err_str for p in block_patterns):
        return True
    return False


async def apply_company_throttling(campaign_id: str, max_contacts_per_company: int) -> None:
    """
    Select up to `max_contacts_per_company` contacts randomly per company as eligible_outreach (pending),
    and defer the rest. Contacts without a company name are always pending/eligible.
    """
    from .models import Recipient
    from app.database import db_pool
    recipients = await Recipient.find(campaign_id=str(campaign_id)).to_list()
    if not recipients:
        return

    company_groups = collections.defaultdict(list)
    pending_ids = []
    deferred_ids = []

    for r in recipients:
        if r.company_name and r.company_name.strip():
            company_groups[r.company_name.strip()].append(r)
        else:
            # If no company name is provided, default/reset status to pending if it was deferred
            if r.status == "deferred":
                pending_ids.append(r.id)

    for company, group in company_groups.items():
        # Count how many are already outreached (sent, replied, bounced)
        outreached = [r for r in group if r.status in ("sent", "replied", "bounced")]
        pending_and_deferred = [r for r in group if r.status in ("pending", "deferred")]

        allowed_slots = max(0, max_contacts_per_company - len(outreached))

        if allowed_slots > 0:
            random.shuffle(pending_and_deferred)
            selected = pending_and_deferred[:allowed_slots]
            deferred = pending_and_deferred[allowed_slots:]

            for r in selected:
                if r.status != "pending":
                    pending_ids.append(r.id)
            for r in deferred:
                if r.status != "deferred":
                    deferred_ids.append(r.id)
        else:
            # No slots remaining, mark all pending/deferred as deferred
            for r in pending_and_deferred:
                if r.status != "deferred":
                    deferred_ids.append(r.id)

    if pending_ids or deferred_ids:
        async with db_pool.acquire() as conn:
            async with conn.transaction():
                if pending_ids:
                    await conn.execute(
                        "UPDATE public.recipients SET status = 'pending' WHERE id = ANY($1::uuid[])",
                        pending_ids
                    )
                if deferred_ids:
                    await conn.execute(
                        "UPDATE public.recipients SET status = 'deferred' WHERE id = ANY($1::uuid[])",
                        deferred_ids
                    )


_active_campaign_runs = set()


# ─── Quota Tracking & Pool Rotation ───────────────────────────────────────────────

async def get_sent_today(config_id: str) -> int:
    """Return how many emails this EmailConfig has sent today (UTC date)."""
    from .models import EmailConfigDailyQuota
    try:
        quota = await EmailConfigDailyQuota.get_or_create_today(config_id)
        return quota.emails_sent
    except Exception as exc:
        logger.error("Error fetching sent today for config %s: %s", config_id, exc)
        return 0


async def increment_quota(config_id: str) -> None:
    """Atomically increment today's sent count for this EmailConfig."""
    from .models import EmailConfigDailyQuota
    try:
        quota = await EmailConfigDailyQuota.get_or_create_today(config_id)
        await quota.increment(1)
    except Exception as exc:
        logger.error("Failed to increment quota for config %s: %s", config_id, exc)



async def is_quota_exhausted(config: Any) -> bool:
    """Return True if this EmailConfig has hit its daily_limit for today."""
    daily_limit = getattr(config, 'daily_limit', None) or 500
    sent_today = await get_sent_today(str(config.id))
    return sent_today >= daily_limit


async def get_available_config(campaign: Any) -> Optional[Any]:
    """
    Select the best available EmailConfig from a campaign's pool.
    Priority: configs with the most quota remaining today (least sent first).
    Falls back to email_config_id if pool is empty.
    Returns None if all configs have exhausted their daily quota.
    """
    from .models import EmailConfig

    # Build full candidate list: pool + primary config (deduplicated)
    pool: list = list(campaign.email_config_pool or [])
    if campaign.email_config_id and campaign.email_config_id not in pool:
        pool.append(campaign.email_config_id)

    if not pool:
        return None

    candidates = []
    for config_id in pool:
        try:
            config = await EmailConfig.get(config_id)
            if not config or not config.is_active:
                continue
            daily_limit = getattr(config, 'daily_limit', None) or 500
            sent_today = await get_sent_today(str(config.id))
            if sent_today < daily_limit:
                candidates.append((sent_today, config))
        except Exception as exc:
            logger.warning("Could not load config %s from pool: %s", config_id, exc)

    if not candidates:
        return None

    # Return the config with the most quota remaining (least used today)
    candidates.sort(key=lambda x: x[0])
    return candidates[0][1]


async def process_campaign_queue(campaign_id: str, limit: Optional[int] = None) -> Dict[str, Any]:
    """
    Consolidated campaign queue processor.
    1. Resolves best available EmailConfig from pool (quota-aware round-robin).
    2. Loads daily workload: fresh contacts + follow-ups due.
    3. Sorts by US timezone priority.
    4. Sends via a persistent SmtpSession (50 emails per connection).
    5. Rotates to next pool config when daily quota is exhausted mid-batch.
    6. Auto-pauses campaign on 3 consecutive spam/auth failures.
    """
    if campaign_id in _active_campaign_runs:
        logger.info("Campaign %s is already processing, skipping duplicate trigger.", campaign_id)
        return {"sent": 0, "failed": 0, "status": "already_running"}

    _active_campaign_runs.add(campaign_id)
    try:
        from .models import Campaign, Recipient, EmailConfig
        from .email_service import send_email, SmtpSession

        campaign = await Campaign.get(campaign_id)
        if not campaign:
            logger.warning("Campaign %s not found.", campaign_id)
            return {"sent": 0, "failed": 0, "status": "not_found"}

        if campaign.status in ["paused", "completed"]:
            logger.info("Campaign %s is %s, skipping queue processing.", campaign_id, campaign.status)
            return {"sent": 0, "failed": 0, "status": campaign.status}

        if not campaign.email_config_id and not campaign.email_config_pool:
            logger.warning("Campaign %s: No EmailConfig attached, pausing campaign.", campaign_id)
            await campaign.update({"$set": {"status": "paused", "diagnostic_error": "No email configuration attached to campaign."}})
            await update_recipient_send_times(campaign.id)
            return {"sent": 0, "failed": 0, "status": "paused"}

        # Validate primary config exists (hard fail — config was deleted)
        if campaign.email_config_id:
            primary_cfg_check = await EmailConfig.get(campaign.email_config_id)
            if not primary_cfg_check:
                logger.warning("Campaign %s: EmailConfig %s not found, pausing campaign.", campaign.id, campaign.email_config_id)
                await campaign.update({"$set": {"status": "paused", "diagnostic_error": "Attached EmailConfig not found."}})
                await update_recipient_send_times(campaign.id)
                return {"sent": 0, "failed": 0, "status": "paused"}

        # Select best available config from pool (quota-aware)
        current_config = await get_available_config(campaign)
        if not current_config:
            logger.info("Campaign %s: All email configs exhausted their daily quota.", campaign.id)
            diag_err = "All email accounts in pool exhausted for today." if campaign.email_config_pool else "Daily quota exhausted for this account. Resumes tomorrow."
            await campaign.update({"$set": {"status": "paused", "diagnostic_error": diag_err}})
            await update_recipient_send_times(campaign.id)
            return {"sent": 0, "failed": 0, "status": "paused"}

        config = current_config  # Alias for template variable rendering

        # Load fresh contacts limit
        fresh_limit = limit if limit is not None else (campaign.daily_fresh_limit or 100)

        # Fetch all recipients
        all_recipients = await Recipient.find(campaign_id=str(campaign.id)).to_list()

        # Filter fresh recipients (status == 'pending')
        fresh_recipients = [r for r in all_recipients if r.status == "pending"]
        fresh_recipients = fresh_recipients[:fresh_limit]

        # Filter active follow-ups due for the day
        now = datetime.now(timezone.utc)
        due_follow_ups = []
        for r in all_recipients:
            if r.status == "sent" and r.next_follow_up_at:
                ref = r.next_follow_up_at
                if ref.tzinfo is None:
                    ref = ref.replace(tzinfo=timezone.utc)
                if ref <= now:
                    due_follow_ups.append(r)

        # Combine fresh contacts and follow-ups due
        combined_recipients = fresh_recipients + due_follow_ups

        if not combined_recipients:
            logger.info("Campaign %s: no pending or due recipients, rescheduling next run.", campaign.id)
            updates = {}
            if campaign.schedule in ["Daily", "Weekly", "Monthly"]:
                next_send_at = calculate_next_send_at(campaign.send_at, campaign.schedule, campaign.timezone, campaign.target_region)
                updates["send_at"] = next_send_at
                updates["status"] = "active"
            else:
                still_deferred = [r for r in all_recipients if r.status == "deferred"]
                if still_deferred:
                    updates["status"] = "active"
                else:
                    updates["send_at"] = None
                    updates["status"] = "completed"
            await campaign.update({"$set": updates})
            return {"sent": 0, "failed": 0, "status": updates.get("status")}

        # Order by US Timezone Priority: EST (1) -> CST (2) -> MST (3) -> PST (4) -> others (5)
        priority_map = {'EST': 1, 'CST': 2, 'MST': 3, 'PST': 4, 'UNKNOWN': 5}
        combined_recipients = sorted(
            combined_recipients,
            key=lambda r: priority_map.get(get_timezone_from_state(r.state), 5)
        )

        # Throttle Gap Calculation
        mails_per_min = campaign.mails_per_minute or 2
        if mails_per_min < 1:
            mails_per_min = 1
        gap_seconds = 60.0 / mails_per_min

        subject_tpl = campaign.subject or f"Hi from {config.sender_name or config.sender_address}"
        body_tpl = campaign.body_template or "Hi {name},\n\nThis is an outreach from our team."

        max_fu = 4
        if campaign.follow_up_templates:
            max_fu = max(1, len(campaign.follow_up_templates) - 1)

        sent, failed = 0, 0
        errors = []

        # Before the send loop: call EmailConfigDailyQuota.get_or_create_today
        from .models import EmailConfigDailyQuota
        quota = await EmailConfigDailyQuota.get_or_create_today(current_config.id)
        remaining = current_config.daily_limit - quota.emails_sent
        if remaining <= 0:
            logger.info("Campaign %s: Daily quota exhausted for this account %s. Resumes tomorrow.", campaign.id, current_config.sender_address)
            diag_err = "Daily quota exhausted for this account. Resumes tomorrow."
            await campaign.update({"$set": {"status": "paused", "diagnostic_error": diag_err}})
            await update_recipient_send_times(campaign.id)
            return {"sent": 0, "failed": 0, "status": "paused"}

        combined_recipients = combined_recipients[:remaining]

        # Open a reusable SMTP session (rotates TCP connection every 50 emails)
        session = SmtpSession(current_config, batch_size=50)

        try:
            # Send Engine Loop
            for idx, r in enumerate(combined_recipients):
                # Hot-reload campaign status to detect manual pauses during sending
                latest_campaign = await Campaign.get(campaign.id)
                if not latest_campaign or latest_campaign.status in ["paused", "completed"]:
                    logger.info("Campaign %s status changed to %s during loop, aborting.",
                               campaign.id, latest_campaign.status if latest_campaign else "deleted")
                    break

                # Check quota and rotate config every 10 sends for efficiency
                if idx > 0 and idx % 10 == 0:
                    if await is_quota_exhausted(current_config):
                        session.close()
                        next_config = await get_available_config(campaign)
                        if not next_config:
                            logger.info("Campaign %s: All configs exhausted mid-batch. Stopping for today.", campaign.id)
                            diag_err = "All email accounts in pool exhausted for today." if campaign.email_config_pool else "Daily quota exhausted for this account. Resumes tomorrow."
                            await campaign.update({"$set": {"status": "paused", "diagnostic_error": diag_err}})
                            await update_recipient_send_times(campaign.id)
                            break
                        current_config = next_config
                        session = SmtpSession(current_config, batch_size=50)
                        logger.info("Campaign %s: Rotated to config %s (%s).",
                                   campaign.id, current_config.id, current_config.sender_address)
                        quota = await EmailConfigDailyQuota.get_or_create_today(current_config.id)

                is_follow_up = (r.status == "sent")
                recipient_name = r.name or (f"{r.first_name} {r.last_name}" if r.first_name or r.last_name else "there")

                # Hot-reload recipient to ensure status hasn't changed concurrently
                latest_recipient = await Recipient.get(r.id)
                if not latest_recipient:
                    logger.info("Recipient %s no longer exists, skipping.", r.email)
                    continue

                if not is_follow_up:
                    if latest_recipient.status != "pending":
                        logger.info("Recipient %s status is %s (expected pending), skipping duplicate send.", r.email, latest_recipient.status)
                        continue
                    subject = (
                        subject_tpl
                        .replace("{name}", recipient_name)
                        .replace("{first_name}", r.first_name or "")
                        .replace("{last_name}", r.last_name or "")
                        .replace("{email}", r.email)
                        .replace("{designation}", r.title or "")
                        .replace("{department}", r.department or "")
                        .replace("{industry}", r.industry or "")
                        .replace("{region}", r.region or "")
                        .replace("{company_name}", r.company_name or "")
                        .replace("{company}", r.company_name or "")
                    )
                    body = (
                        body_tpl
                        .replace("{name}", recipient_name)
                        .replace("{first_name}", r.first_name or "")
                        .replace("{last_name}", r.last_name or "")
                        .replace("{email}", r.email)
                        .replace("{designation}", r.title or "")
                        .replace("{department}", r.department or "")
                        .replace("{industry}", r.industry or "")
                        .replace("{region}", r.region or "")
                        .replace("{company_name}", r.company_name or "")
                        .replace("{company}", r.company_name or "")
                    )
                else:
                    if latest_recipient.status != "sent":
                        logger.info("Recipient %s status is %s (expected sent), skipping duplicate follow-up.", r.email, latest_recipient.status)
                        continue
                    next_count = r.follow_up_count + 1
                    subject_raw = f"Re: {subject_tpl}"
                    subject = (
                        subject_raw
                        .replace("{name}", recipient_name)
                        .replace("{first_name}", r.first_name or "")
                        .replace("{last_name}", r.last_name or "")
                        .replace("{email}", r.email)
                        .replace("{designation}", r.title or "")
                        .replace("{department}", r.department or "")
                        .replace("{industry}", r.industry or "")
                        .replace("{region}", r.region or "")
                        .replace("{company_name}", r.company_name or "")
                        .replace("{company}", r.company_name or "")
                    )
                    body = None
                    if campaign.follow_up_templates and len(campaign.follow_up_templates) > next_count:
                        body = campaign.follow_up_templates[next_count]
                    if not body:
                        body = (
                            f"Hi {recipient_name},\n\n"
                            f"Just following up on my previous message regarding {campaign.name}. "
                            f"I wanted to quickly check back and see if you had any thoughts or questions!\n\n"
                            f"Best regards,\n"
                            f"{current_config.sender_name or current_config.sender_address}"
                        )
                    else:
                        body = (
                            body
                            .replace("{name}", recipient_name)
                            .replace("{first_name}", r.first_name or "")
                            .replace("{last_name}", r.last_name or "")
                            .replace("{email}", r.email)
                            .replace("{designation}", r.title or "")
                            .replace("{department}", r.department or "")
                            .replace("{industry}", r.industry or "")
                            .replace("{region}", r.region or "")
                            .replace("{company_name}", r.company_name or "")
                            .replace("{company}", r.company_name or "")
                        )

                try:
                    await asyncio.to_thread(
                        session.send_message,
                        r.email,
                        subject,
                        body,
                        None,        # html_body — auto-generated from plain text in SmtpSession
                        str(r.id),   # recipient_id for tracking pixel
                    )

                    # Increment the daily quota counter for the account that just sent
                    await quota.increment(1)

                    # Reset consecutive failure counter on success
                    await campaign.update({"$set": {"consecutive_failures": 0, "diagnostic_error": None}})

                    if not is_follow_up:
                        next_time = calculate_next_follow_up(campaign, 1)
                        await r.update({
                            "$set": {
                                "status": "sent",
                                "max_follow_ups": max_fu,
                                "follow_up_count": 0,
                                "next_follow_up_at": next_time
                            }
                        })
                    else:
                        if next_count >= r.max_follow_ups:
                            await r.update({
                                "$set": {
                                    "follow_up_count": next_count,
                                    "next_follow_up_at": None
                                }
                            })
                        else:
                            next_time = calculate_next_follow_up(campaign, 1)
                            await r.update({
                                "$set": {
                                    "follow_up_count": next_count,
                                    "next_follow_up_at": next_time
                                }
                            })
                    sent += 1
                except Exception as exc:
                    logger.error("Failed sending to %s: %s", r.email, exc)
                    errors.append({"email": r.email, "error": str(exc)})
                    await r.update({
                        "$set": {
                            "status": "bounced",
                            "max_follow_ups": 0,
                            "next_follow_up_at": None
                        }
                    })
                    failed += 1

                    # Spam Block protection
                    if is_block_or_auth_error(exc):
                        campaign = await Campaign.get(campaign.id)
                        new_failures = (campaign.consecutive_failures or 0) + 1
                        await campaign.update({"$set": {"consecutive_failures": new_failures}})

                        if new_failures >= 3:
                            diag_err = f"Spam block or authentication failure: {str(exc)}"
                            logger.error("🚨 Consecutive failure threshold reached. Pausing campaign %s. Error: %s", campaign.name, diag_err)
                            await campaign.update({"$set": {
                                "status": "paused",
                                "diagnostic_error": diag_err
                            }})
                            await update_recipient_send_times(campaign.id)
                            break  # Pause sending immediately

                # Sleep between sends (unless last item)
                if idx < len(combined_recipients) - 1:
                    await asyncio.sleep(gap_seconds)

        finally:
            session.close()

        # Post-batch calculations
        campaign = await Campaign.get(campaign.id)
        if campaign and campaign.status not in ["paused", "completed"]:
            updates = {}
            if campaign.schedule in ["Daily", "Weekly", "Monthly"]:
                next_send_at = calculate_next_send_at(campaign.send_at, campaign.schedule, campaign.timezone, campaign.target_region)
                updates["send_at"] = next_send_at
                updates["status"] = "active"
            else:
                still_pending = await Recipient.find(campaign_id=str(campaign.id), status="pending").to_list()
                still_deferred = await Recipient.find(campaign_id=str(campaign.id), status="deferred").to_list()
                if not still_pending and not still_deferred:
                    updates["status"] = "completed"
                    updates["send_at"] = None
                elif not still_pending and still_deferred:
                    # Keep active since there are still deferred leads to process later
                    updates["status"] = "active"

            if sent > 0 and campaign.status == "draft":
                updates["status"] = "active"

            if updates:
                await campaign.update({"$set": updates})

        return {"sent": sent, "failed": failed, "errors": errors, "status": campaign.status if campaign else "deleted"}
    finally:
        _active_campaign_runs.discard(campaign_id)


async def _run_scheduled_campaigns() -> None:
    """Check for campaigns that are due and fire SMTP sends."""
    from .models import Campaign

    all_campaigns = await Campaign.find().to_list()
    candidates = [
        c for c in all_campaigns 
        if c.status in ["draft", "active"] and c.send_at and c.email_config_id
    ]

    now = datetime.now(timezone.utc)

    for campaign in candidates:
        if not campaign.send_at:
            continue
        try:
            send_dt_str = campaign.send_at.replace("Z", "+00:00")
            send_dt = datetime.fromisoformat(send_dt_str)
            if send_dt.tzinfo is None:
                send_dt = send_dt.replace(tzinfo=timezone.utc)
        except ValueError:
            logger.warning("Campaign %s has invalid send_at: %s", campaign.id, campaign.send_at)
            continue

        if send_dt > now:
            continue

        # Run consolidated daily processor asynchronously
        asyncio.create_task(process_campaign_queue(str(campaign.id)))


async def update_recipient_send_times(campaign_id: str) -> None:
    """Pre-calculate and save estimated dispatch times for all pending campaign recipients."""
    from .models import Campaign, Recipient
    from datetime import datetime, timedelta, timezone
    from app.database import db_pool

    campaign = await Campaign.get(campaign_id)
    if not campaign:
        return

    # Fetch all pending recipients
    pending_recipients = await Recipient.find(campaign_id=campaign_id, status="pending").to_list()

    if campaign.status == "paused" or not campaign.send_at:
        # Clear estimated send times if campaign is paused or has no send_at
        ids = [r.id for r in pending_recipients]
        if ids:
            async with db_pool.acquire() as conn:
                await conn.execute("UPDATE public.recipients SET send_at = NULL WHERE id = ANY($1::uuid[])", ids)
        return

    try:
        send_dt_str = campaign.send_at.replace("Z", "+00:00")
        base_time = datetime.fromisoformat(send_dt_str)
        if base_time.tzinfo is None:
            base_time = base_time.replace(tzinfo=timezone.utc)
    except Exception:
        base_time = datetime.now(timezone.utc)

    # Sort them by US Timezone Priority
    priority_map = {'EST': 1, 'CST': 2, 'MST': 3, 'PST': 4, 'UNKNOWN': 5}
    pending_recipients = sorted(
        pending_recipients,
        key=lambda r: priority_map.get(get_timezone_from_state(r.state), 5)
    )

    mails_per_min = campaign.mails_per_minute or 2
    if mails_per_min < 1:
        mails_per_min = 1
    gap_seconds = 60.0 / mails_per_min

    batch_data = []
    for idx, r in enumerate(pending_recipients):
        est_send_time = base_time + timedelta(seconds=idx * gap_seconds)
        batch_data.append((est_send_time, r.id))

    if batch_data:
        async with db_pool.acquire() as conn:
            async with conn.transaction():
                await conn.executemany(
                    "UPDATE public.recipients SET send_at = $1 WHERE id = $2::uuid",
                    batch_data
                )


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
    _scheduler.start()
    logger.info("📅 Campaign scheduler started (polls every 60s)")


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Campaign scheduler stopped")
