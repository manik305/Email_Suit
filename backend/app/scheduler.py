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
import smtplib

from apscheduler.schedulers.asyncio import AsyncIOScheduler

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


def calculate_next_send_at(current_send_at_str: Optional[str], schedule: str, tz_name: Optional[str], target_region: str = "US") -> Optional[str]:
    """Calculate the next send_at time, preserving the local hour/minute in the campaign's timezone."""
    if not schedule or schedule == "Once":
        return None
        
    now = datetime.now(timezone.utc)
    
    try:
        tz = ZoneInfo(tz_name) if tz_name else ZoneInfo("America/New_York")
    except Exception:
        tz = ZoneInfo("America/New_York")
        
    if current_send_at_str:
        try:
            current_dt = datetime.fromisoformat(current_send_at_str.replace("Z", "+00:00")).astimezone(tz)
            target_hour = current_dt.hour
            target_minute = current_dt.minute
        except Exception:
            target_hour = 9
            target_minute = 0
    else:
        target_hour = 9
        target_minute = 0
        
    local_now = now.astimezone(tz)
    
    if schedule == "Daily":
        target_time = local_now.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
        if local_now >= target_time:
            target_time += timedelta(days=1)
            
    elif schedule == "Weekly":
        target_time = local_now.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
        if local_now >= target_time:
            target_time += timedelta(days=7)
            
    elif schedule == "Monthly":
        target_time = local_now.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
        if local_now >= target_time:
            target_time += timedelta(days=30)
    else:
        return None

    # Skip weekends: if target day is Saturday (5) or Sunday (6), move to Monday
    while target_time.weekday() >= 5:
        target_time += timedelta(days=1)

    return target_time.astimezone(timezone.utc).isoformat()


def calculate_next_follow_up(campaign: 'Campaign', days: int = 3) -> datetime:
    """Calculate the next follow-up datetime matching the campaign's target timezone and time of day (min gap 3 business days)."""
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
    result_utc = next_follow_up_local.astimezone(timezone.utc)
    # Guarantee result is at least 20 hours in the future to prevent same-day resending
    if result_utc <= now + timedelta(hours=20):
        result_utc += timedelta(days=1)
    return result_utc


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


_active_config_locks = set()


async def get_available_config(campaign: Any, exclude_locked: bool = True) -> Optional[Any]:
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
        # Exclude currently active SMTP config connections to prevent collisions
        if exclude_locked and str(config_id) in _active_config_locks:
            continue
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


async def check_imap_inbox_for_updates(campaign) -> None:
    """Connect to the campaign's active email configs and sync IMAP replies/bounces to PG and Neo4j."""
    import re
    from .models import EmailConfig, Recipient, DncEntry
    from .email_service import fetch_inbox
    from app.neo4j_sync import sync_lead_response
    
    # Get active configs
    pool = list(campaign.email_config_pool or [])
    if campaign.email_config_id and campaign.email_config_id not in pool:
        pool.append(campaign.email_config_id)
        
    for config_id in pool:
        config = await EmailConfig.get(config_id)
        if not config or not config.is_active or not config.imap:
            continue
            
        try:
            logger.info("IMAP Sync: Checking inbox for account %s in campaign %s", config.sender_address, campaign.id)
            # Fetch last 50 emails
            messages = await fetch_inbox(config, mailbox="INBOX", limit=50)
            for msg in messages:
                # 1. Check if it's a bounce
                is_bounce = (
                    "delivery status" in msg.subject.lower()
                    or "undelivered" in msg.subject.lower()
                    or "undeliverable" in msg.subject.lower()
                    or "mailer-daemon" in msg.from_addr.lower()
                    or "postmaster" in msg.from_addr.lower()
                )
                if is_bounce:
                    email_match = []
                    body_text = msg.body or ""
                    subject_text = msg.subject or ""
                    snippet_text = msg.snippet or ""

                    # 1. Look for Final-Recipient or Original-Recipient in the body
                    final_recip_matches = re.findall(
                        r'(?:Final-Recipient|Original-Recipient):\s*(?:rfc822;\s*)?([a-zA-Z0-9\.\-_]+@[a-zA-Z0-9\.\-_]+\.[a-zA-Z0-9\.\-_]+)',
                        body_text,
                        re.IGNORECASE
                    )
                    if final_recip_matches:
                        email_match.extend(final_recip_matches)

                    # 2. Look for To: header in the body (quotes the failed recipient)
                    to_matches = re.findall(
                        r'^\s*To:\s*(?:[^<>\n]*<)?([a-zA-Z0-9\.\-_]+@[a-zA-Z0-9\.\-_]+\.[a-zA-Z0-9\.\-_]+)>?',
                        body_text,
                        re.MULTILINE | re.IGNORECASE
                    )
                    if to_matches:
                        email_match.extend(to_matches)

                    # 3. Look in subject
                    subject_emails = re.findall(r'[\w\.-]+@[\w\.-]+\.\w+', subject_text)
                    if subject_emails:
                        email_match.extend(subject_emails)

                    # 4. If nothing found yet, fall back to snippet or first non-sender email in the body
                    if not email_match:
                        snippet_emails = re.findall(r'[\w\.-]+@[\w\.-]+\.\w+', snippet_text)
                        if snippet_emails:
                            email_match.extend(snippet_emails)

                    if not email_match:
                        all_body_emails = re.findall(r'[\w\.-]+@[\w\.-]+\.\w+', body_text)
                        if all_body_emails:
                            sender_addr = config.sender_address.lower().strip()
                            filtered_emails = [e for e in all_body_emails if e.lower().strip() != sender_addr]
                            if filtered_emails:
                                email_match.append(filtered_emails[0])

                    # Clean and deduplicate list
                    email_match = {e.lower().strip() for e in email_match}
                    
                    # Filter out our own sender address and system addresses from final matches
                    sender_addr = config.sender_address.lower().strip()
                    email_match = {e for e in email_match if e != sender_addr and "mailer-daemon" not in e and "postmaster" not in e}

                    for email_found in email_match:
                        if "mailer-daemon" in email_found or "postmaster" in email_found:
                            continue
                        # Find recipient
                        rec = await Recipient.find_one(email=email_found, campaign_id=str(campaign.id))
                        if rec and (rec.status != "bounced" or rec.response_category != "bounce"):
                            logger.info("IMAP Sync: Detected bounce for recipient %s in campaign %s", rec.email, campaign.id)
                            await rec.update({"$set": {
                                "status": "bounced",
                                "response_category": "bounce",
                                "next_follow_up_at": None,
                                "max_follow_ups": 0
                            }})
                            # Project wide DNC listing
                            if campaign.project_id:
                                exists = await DncEntry.find_one(email=rec.email, project_id=str(campaign.project_id))
                                if not exists:
                                    dnc = DncEntry(
                                        email=rec.email,
                                        reason="bounce",
                                        source_campaign_id=str(campaign.id),
                                        project_id=str(campaign.project_id),
                                        notes=f"Auto-classified as bounce via IMAP background sync. Msg: {msg.subject}",
                                        classified_by="agentic-scheduler@system"
                                    )
                                    await dnc.insert()
                            
                            # Neo4j Sync
                            try:
                                await sync_lead_response(recipient_id=rec.id, category="bounce", response_text=msg.body or msg.snippet or "")
                            except Exception as neo_err:
                                logger.error("IMAP Sync: Neo4j sync failed: %s", neo_err)
                
                # 2. Check if it's a regular reply (not a bounce, not from our sender address)
                else:
                    sender_email = msg.from_addr
                    if "<" in sender_email and ">" in sender_email:
                        sender_email = sender_email.split("<")[1].split(">")[0].strip()
                    sender_email = sender_email.strip().lower()
                    
                    if sender_email == config.sender_address.lower():
                        continue
                        
                    rec = await Recipient.find_one(email=sender_email, campaign_id=str(campaign.id))
                    if rec and rec.status == "sent":
                        # Detect if it's an auto-reply (e.g. out of office)
                        subject_lower = msg.subject.lower()
                        is_auto_reply = (
                            "out of office" in subject_lower
                            or "out of the office" in subject_lower
                            or "automatic reply" in subject_lower
                            or "auto reply" in subject_lower
                            or "auto-reply" in subject_lower
                            or "autoresponse" in subject_lower
                            or "vacation reply" in subject_lower
                            or "vacation notification" in subject_lower
                            or "autoreply" in subject_lower
                            or "away from office" in subject_lower
                            or "automatic response" in subject_lower
                        )
                        if is_auto_reply:
                            logger.info("IMAP Sync: Detected auto-reply (out of office) from %s, ignoring to keep follow-up sequence active.", rec.email)
                            continue

                        # Mark as replied, clear follow-ups
                        logger.info("IMAP Sync: Detected real reply from recipient %s in campaign %s", rec.email, campaign.id)
                        await rec.update({"$set": {
                            "status": "replied",
                            "next_follow_up_at": None,
                            "response_category": None  # Left as None/unclassified for manual user labeling
                        }})
                        
                        # Project-wide DNC
                        if campaign.project_id:
                            exists = await DncEntry.find_one(email=rec.email, project_id=str(campaign.project_id))
                            if not exists:
                                dnc = DncEntry(
                                    email=rec.email,
                                    reason="lead",  # Default reason for Project-wide DNC list
                                    source_campaign_id=str(campaign.id),
                                    project_id=str(campaign.project_id),
                                    notes=f"Auto-added to DNC via IMAP reply detection. Msg: {msg.subject}",
                                    classified_by="agentic-scheduler@system"
                                )
                                await dnc.insert()
                                
                        # Neo4j Sync
                        try:
                            await sync_lead_response(recipient_id=rec.id, category="replied", response_text=msg.body or msg.snippet or "")
                        except Exception as neo_err:
                            logger.error("IMAP Sync: Neo4j sync failed: %s", neo_err)
        except Exception as e:
            logger.warning("IMAP Sync: Error fetching inbox for config %s: %s", config.sender_address, e)


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

        # Check IMAP inbox for bounces/replies first
        try:
            await check_imap_inbox_for_updates(campaign)
        except Exception as imap_sync_err:
            logger.warning("Campaign %s: Failed to sync IMAP inbox during run: %s", campaign.id, imap_sync_err)


        # ── Strict Weekend Execution Block ──
        # Ensure we do not send any fresh contacts or follow-ups on weekends.
        campaign_tz_name = campaign.timezone or "America/New_York"
        try:
            tz = ZoneInfo(campaign_tz_name)
        except Exception:
            tz = ZoneInfo("America/New_York")
        local_now = datetime.now(timezone.utc).astimezone(tz)
        if local_now.weekday() >= 5:
            logger.info("Campaign %s: Weekend detected (%s). Skipping execution.", campaign_id, local_now.strftime("%A"))
            _active_campaign_runs.discard(campaign_id)
            return {"sent": 0, "failed": 0, "status": "weekend_skip"}


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

        # Check if there are any active configs in the pool or primary config
        pool: list = list(campaign.email_config_pool or [])
        if campaign.email_config_id and campaign.email_config_id not in pool:
            pool.append(campaign.email_config_id)
            
        configs_loaded = []
        for config_id in pool:
            cfg = await EmailConfig.get(config_id)
            if cfg:
                configs_loaded.append(cfg)
                
        active_configs = [c for c in configs_loaded if c.is_active]
        if not active_configs:
            logger.warning("Campaign %s: All attached email configurations are inactive.", campaign_id)
            await campaign.update({"$set": {
                "status": "paused",
                "diagnostic_error": "All attached email configurations are inactive. Please activate them or link an active one."
            }})
            await update_recipient_send_times(campaign.id)
            _active_campaign_runs.discard(campaign_id)
            return {"sent": 0, "failed": 0, "status": "paused"}

        # Select best available config from pool (quota-aware and lock-aware)
        current_config = await get_available_config(campaign, exclude_locked=True)
        if not current_config:
            # Check if it was because of quota exhaustion, or if configs are just currently busy
            has_quota_config = await get_available_config(campaign, exclude_locked=False)
            if has_quota_config:
                logger.info("Campaign %s: All active configs with quota are currently locked/busy. Rescheduling in 60s.", campaign.id)
                await campaign.update({"$set": {
                    "send_at": (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat(),
                    "status": "active",
                    "diagnostic_error": "SMTP accounts are currently busy. Retrying shortly."
                }})
                _active_campaign_runs.discard(campaign_id)
                return {"sent": 0, "failed": 0, "status": "active"}
            else:
                logger.info("Campaign %s: All email configs exhausted their daily quota.", campaign.id)
                diag_err = "All email accounts in pool exhausted for today." if campaign.email_config_pool else "Daily quota exhausted for this account. Resumes tomorrow."
                # Reschedule to next day, do NOT pause
                next_send_at = calculate_next_send_at(campaign.send_at, campaign.schedule or "Daily", campaign.timezone, campaign.target_region)
                if not next_send_at:
                    next_send_at = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
                await campaign.update({"$set": {
                    "send_at": next_send_at,
                    "status": "active",
                    "diagnostic_error": diag_err
                }})
                await update_recipient_send_times(campaign.id)
                _active_campaign_runs.discard(campaign_id)
                return {"sent": 0, "failed": 0, "status": "active"}

        config_id_str = str(current_config.id)
        _active_config_locks.add(config_id_str)
        config = current_config  # Alias for template variable rendering

        # Load fresh contacts limit
        fresh_limit = limit if limit is not None else (campaign.daily_fresh_limit or 100)

        # Fetch all recipients
        all_recipients = await Recipient.find(campaign_id=str(campaign.id)).to_list()

        # Filter fresh recipients (status == 'pending')
        # Only include pending recipients whose send_at is null or in the past (to respect retry delays)
        now = datetime.now(timezone.utc)
        fresh_recipients = []
        for r in all_recipients:
            if r.status == "pending":
                if r.last_sent_at:
                    l_sent = r.last_sent_at
                    if isinstance(l_sent, str):
                        try:
                            l_sent = datetime.fromisoformat(l_sent.replace("Z", "+00:00"))
                        except Exception:
                            l_sent = None
                    if l_sent and l_sent.tzinfo is None:
                        l_sent = l_sent.replace(tzinfo=timezone.utc)
                    if l_sent and (now - l_sent).total_seconds() < 20 * 3600:
                        continue
                if r.send_at:
                    ref = r.send_at
                    if isinstance(ref, str):
                        try:
                            ref = datetime.fromisoformat(ref.replace("Z", "+00:00"))
                        except ValueError:
                            ref = now
                    if ref.tzinfo is None:
                        ref = ref.replace(tzinfo=timezone.utc)
                    if ref <= now:
                        fresh_recipients.append(r)
                else:
                    fresh_recipients.append(r)

        fresh_recipients = fresh_recipients[:fresh_limit]

        # Filter active follow-ups due for the day
        now = datetime.now(timezone.utc)
        due_follow_ups = []
        for r in all_recipients:
            if r.status == "sent" and r.next_follow_up_at:
                if r.last_sent_at:
                    l_sent = r.last_sent_at
                    if isinstance(l_sent, str):
                        try:
                            l_sent = datetime.fromisoformat(l_sent.replace("Z", "+00:00"))
                        except Exception:
                            l_sent = None
                    if l_sent and l_sent.tzinfo is None:
                        l_sent = l_sent.replace(tzinfo=timezone.utc)
                    if l_sent and (now - l_sent).total_seconds() < 20 * 3600:
                        continue
                ref = r.next_follow_up_at
                if isinstance(ref, str):
                    try:
                        ref = datetime.fromisoformat(ref.replace("Z", "+00:00"))
                    except Exception:
                        ref = None
                if ref:
                    if ref.tzinfo is None:
                        ref = ref.replace(tzinfo=timezone.utc)
                    if ref <= now:
                        due_follow_ups.append(r)

        # Group overdue follow-ups by YYYY-MM-DD of original send_at date in campaign timezone
        # and process them up to the daily_followup_limit (oldest batches first).
        if due_follow_ups:
            def get_send_date_str(rec):
                if not rec.send_at:
                    return "unknown"
                try:
                    tz_name = campaign.timezone or "America/New_York"
                    tz = ZoneInfo(tz_name)
                    send_dt = rec.send_at
                    if isinstance(send_dt, str):
                        send_dt = datetime.fromisoformat(send_dt.replace("Z", "+00:00"))
                    return send_dt.astimezone(tz).strftime("%Y-%m-%d")
                except Exception:
                    send_dt = rec.send_at
                    if isinstance(send_dt, str):
                        return send_dt[:10]
                    return send_dt.strftime("%Y-%m-%d")

            due_by_date = collections.defaultdict(list)
            for r in due_follow_ups:
                due_by_date[get_send_date_str(r)].append(r)

            sorted_dates = sorted([d for d in due_by_date.keys() if d != "unknown"])
            selected_follow_ups = []
            followup_limit = campaign.daily_followup_limit or 200

            for d in sorted_dates:
                batch = due_by_date[d]
                remaining_slots = followup_limit - len(selected_follow_ups)
                if remaining_slots <= 0:
                    break
                selected_follow_ups.extend(batch[:remaining_slots])

            if len(selected_follow_ups) < followup_limit and "unknown" in due_by_date:
                batch = due_by_date["unknown"]
                remaining_slots = followup_limit - len(selected_follow_ups)
                selected_follow_ups.extend(batch[:remaining_slots])

            due_follow_ups = selected_follow_ups
            logger.info("Campaign %s: Grouping follow-ups by fresh send date. Processed up to limit %d. Actual: %d", campaign.id, followup_limit, len(due_follow_ups))

        # Combine fresh contacts and follow-ups due
        combined_recipients = fresh_recipients + due_follow_ups


        # ── DNC Filter: Skip any recipients on the project-scoped DNC list ──
        if campaign.project_id:
            from .models import DncEntry
            dnc_entries = await DncEntry.find(project_id=str(campaign.project_id)).to_list()
            dnc_emails = {entry.email.lower() for entry in dnc_entries}
            pre_filter_count = len(combined_recipients)
            combined_recipients = [
                r for r in combined_recipients
                if r.email.lower() not in dnc_emails and not r.response_category
            ]
            skipped = pre_filter_count - len(combined_recipients)
            if skipped > 0:
                logger.info(
                    "Campaign %s: Skipped %d DNC-listed recipients.",
                    campaign.id, skipped
                )
        else:
            # Even without project, skip recipients with response_category set
            combined_recipients = [
                r for r in combined_recipients if not r.response_category
            ]

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
            # Release lock
            _active_config_locks.discard(config_id_str)
            # Reschedule to next day, do NOT pause
            next_send_at = calculate_next_send_at(campaign.send_at, campaign.schedule or "Daily", campaign.timezone, campaign.target_region)
            if not next_send_at:
                next_send_at = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
            await campaign.update({"$set": {
                "send_at": next_send_at,
                "status": "active",
                "diagnostic_error": diag_err
            }})
            await update_recipient_send_times(campaign.id)
            return {"sent": 0, "failed": 0, "status": "active"}

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
                        # Release lock on current config
                        _active_config_locks.discard(config_id_str)
                        
                        next_config = await get_available_config(campaign, exclude_locked=True)
                        if not next_config:
                            # Check if configs have quota but are just currently busy/locked
                            has_quota_config = await get_available_config(campaign, exclude_locked=False)
                            if has_quota_config:
                                logger.info("Campaign %s: All configs busy during mid-batch rotation. Postponing.", campaign.id)
                                await campaign.update({"$set": {
                                    "send_at": (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat(),
                                    "status": "active",
                                    "diagnostic_error": "SMTP accounts are currently busy. Retrying shortly."
                                }})
                                await update_recipient_send_times(campaign.id)
                                break
                            else:
                                logger.info("Campaign %s: All configs exhausted mid-batch. Stopping for today.", campaign.id)
                                diag_err = "All email accounts in pool exhausted for today." if campaign.email_config_pool else "Daily quota exhausted for this account. Resumes tomorrow."
                                # Reschedule for tomorrow, keep ACTIVE
                                next_send_at = calculate_next_send_at(campaign.send_at, campaign.schedule or "Daily", campaign.timezone, campaign.target_region)
                                if not next_send_at:
                                    next_send_at = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
                                await campaign.update({"$set": {
                                    "send_at": next_send_at,
                                    "status": "active",
                                    "diagnostic_error": diag_err
                                }})
                                await update_recipient_send_times(campaign.id)
                                break
                        current_config = next_config
                        config_id_str = str(current_config.id)
                        _active_config_locks.add(config_id_str)
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
                        .replace("{{name}}", recipient_name).replace("{name}", recipient_name)
                        .replace("{{first_name}}", r.first_name or "").replace("{first_name}", r.first_name or "")
                        .replace("{{last_name}}", r.last_name or "").replace("{last_name}", r.last_name or "")
                        .replace("{{email}}", r.email).replace("{email}", r.email)
                        .replace("{{designation}}", r.title or "").replace("{designation}", r.title or "")
                        .replace("{{department}}", r.department or "").replace("{department}", r.department or "")
                        .replace("{{industry}}", r.industry or "").replace("{industry}", r.industry or "")
                        .replace("{{region}}", r.region or "").replace("{region}", r.region or "")
                        .replace("{{company_name}}", r.company_name or "").replace("{company_name}", r.company_name or "")
                        .replace("{{company}}", r.company_name or "").replace("{company}", r.company_name or "")
                    )
                    body = (
                        body_tpl
                        .replace("{{name}}", recipient_name).replace("{name}", recipient_name)
                        .replace("{{first_name}}", r.first_name or "").replace("{first_name}", r.first_name or "")
                        .replace("{{last_name}}", r.last_name or "").replace("{last_name}", r.last_name or "")
                        .replace("{{email}}", r.email).replace("{email}", r.email)
                        .replace("{{designation}}", r.title or "").replace("{designation}", r.title or "")
                        .replace("{{department}}", r.department or "").replace("{department}", r.department or "")
                        .replace("{{industry}}", r.industry or "").replace("{industry}", r.industry or "")
                        .replace("{{region}}", r.region or "").replace("{region}", r.region or "")
                        .replace("{{company_name}}", r.company_name or "").replace("{company_name}", r.company_name or "")
                        .replace("{{company}}", r.company_name or "").replace("{company}", r.company_name or "")
                    )
                else:
                    if latest_recipient.status != "sent":
                        logger.info("Recipient %s status is %s (expected sent), skipping duplicate follow-up.", r.email, latest_recipient.status)
                        continue
                    next_count = r.follow_up_count + 1
                    subject_raw = f"Re: {subject_tpl}"
                    subject = (
                        subject_raw
                        .replace("{{name}}", recipient_name).replace("{name}", recipient_name)
                        .replace("{{first_name}}", r.first_name or "").replace("{first_name}", r.first_name or "")
                        .replace("{{last_name}}", r.last_name or "").replace("{last_name}", r.last_name or "")
                        .replace("{{email}}", r.email).replace("{email}", r.email)
                        .replace("{{designation}}", r.title or "").replace("{designation}", r.title or "")
                        .replace("{{department}}", r.department or "").replace("{department}", r.department or "")
                        .replace("{{industry}}", r.industry or "").replace("{industry}", r.industry or "")
                        .replace("{{region}}", r.region or "").replace("{region}", r.region or "")
                        .replace("{{company_name}}", r.company_name or "").replace("{company_name}", r.company_name or "")
                        .replace("{{company}}", r.company_name or "").replace("{company}", r.company_name or "")
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
                            .replace("{{name}}", recipient_name).replace("{name}", recipient_name)
                            .replace("{{first_name}}", r.first_name or "").replace("{first_name}", r.first_name or "")
                            .replace("{{last_name}}", r.last_name or "").replace("{last_name}", r.last_name or "")
                            .replace("{{email}}", r.email).replace("{email}", r.email)
                            .replace("{{designation}}", r.title or "").replace("{designation}", r.title or "")
                            .replace("{{department}}", r.department or "").replace("{department}", r.department or "")
                            .replace("{{industry}}", r.industry or "").replace("{industry}", r.industry or "")
                            .replace("{{region}}", r.region or "").replace("{region}", r.region or "")
                            .replace("{{company_name}}", r.company_name or "").replace("{company_name}", r.company_name or "")
                            .replace("{{company}}", r.company_name or "").replace("{company}", r.company_name or "")
                        )

                import re
                has_html = bool(re.search(r'<[a-zA-Z/][^>]*>', body))
                if has_html:
                    html_body = body.replace("\n", "<br/>")
                    # Clean up list elements to avoid double br tags inside lists
                    html_body = html_body.replace("<ul><br/>", "<ul>")
                    html_body = html_body.replace("<ol><br/>", "<ol>")
                    html_body = html_body.replace("</li><br/>", "</li>")
                    html_body = html_body.replace("</ul><br/>", "</ul>")
                    html_body = html_body.replace("</ol><br/>", "</ol>")
                    # Standardize breaks and strip tags for plaintext version
                    plain_body = re.sub(r'<br\s*/?>', '\n', body)
                    plain_body = re.sub(r'</p>', '\n\n', plain_body)
                    plain_body = re.sub(r'<[^>]+>', '', plain_body)
                    plain_body = re.sub(r'\n{3,}', '\n\n', plain_body).strip()
                else:
                    html_body = None
                    plain_body = body

                msg_id = None
                send_success = False
                try:
                    target_email = r.email.strip(" \t\n\r,;\"'")
                    in_reply_to_header = None
                    references_header = None
                    if is_follow_up and r.last_message_id:
                        in_reply_to_header = r.last_message_id
                        references_header = r.last_message_id

                    msg_id = await asyncio.to_thread(
                        session.send_message,
                        target_email,
                        subject,
                        plain_body,
                        html_body,
                        str(r.id),   # recipient_id for tracking pixel
                        in_reply_to_header,
                        references_header,
                    )
                    send_success = True
                except smtplib.SMTPRecipientsRefused as exc:
                    logger.error("Recipient %s refused (Bounce): %s", r.email, exc)
                    errors.append({"email": r.email, "error": f"Recipient refused: {exc}"})
                    await r.update({
                        "$set": {
                            "status": "bounced",
                            "response_category": "bounce",
                            "max_follow_ups": 0,
                            "next_follow_up_at": None
                        }
                    })
                    failed += 1
                except smtplib.SMTPResponseException as exc:
                    if 500 <= exc.smtp_code <= 599 and exc.smtp_code not in (554, 535, 530):
                        logger.error("SMTP permanent error sending to %s: %s", r.email, exc)
                        errors.append({"email": r.email, "error": f"Permanent SMTP Error: {exc}"})
                        await r.update({
                            "$set": {
                                "status": "bounced",
                                "response_category": "bounce",
                                "max_follow_ups": 0,
                                "next_follow_up_at": None
                            }
                        })
                    else:
                        logger.error("Transient SMTP failure sending to %s: %s", r.email, exc)
                        errors.append({"email": r.email, "error": str(exc)})
                        retry_time = datetime.now(timezone.utc) + timedelta(hours=1)
                        update_doc = {"next_follow_up_at": retry_time} if is_follow_up else {"send_at": retry_time}
                        await r.update({"$set": update_doc})
                        failed += 1
                        
                        # Spam Block protection
                        if is_block_or_auth_error(exc):
                            campaign_db = await Campaign.get(campaign.id)
                            new_failures = (campaign_db.consecutive_failures or 0) + 1
                            await campaign_db.update({"$set": {"consecutive_failures": new_failures}})

                            if new_failures >= 3:
                                diag_err = f"Spam block or authentication failure: {str(exc)}"
                                logger.error("🚨 Consecutive failure threshold reached. Pausing campaign %s. Error: %s", campaign_db.name, diag_err)
                                await campaign_db.update({"$set": {
                                    "status": "paused",
                                    "diagnostic_error": diag_err
                                }})
                                await update_recipient_send_times(campaign_db.id)
                                break  # Pause sending immediately
                except Exception as exc:
                    logger.error("Transient failure sending to %s: %s", r.email, exc)
                    errors.append({"email": r.email, "error": str(exc)})
                    retry_time = datetime.now(timezone.utc) + timedelta(hours=1)
                    update_doc = {"next_follow_up_at": retry_time} if is_follow_up else {"send_at": retry_time}
                    await r.update({"$set": update_doc})
                    failed += 1
                    
                if send_success:
                    try:
                        # Increment the daily quota counter for the account that just sent
                        await quota.increment(1)

                        # Reset consecutive failure counter on success
                        await campaign.update({"$set": {"consecutive_failures": 0, "diagnostic_error": None}})

                        if not is_follow_up:
                            next_time = calculate_next_follow_up(campaign, 3)
                            await r.update({
                                "$set": {
                                    "status": "sent",
                                    "max_follow_ups": max_fu,
                                    "follow_up_count": 0,
                                    "next_follow_up_at": next_time,
                                    "send_at": datetime.now(timezone.utc),
                                    "last_sent_at": datetime.now(timezone.utc),
                                    "last_message_id": msg_id
                                }
                            })
                        else:
                            if next_count >= r.max_follow_ups:
                                await r.update({
                                    "$set": {
                                        "status": "no_response",
                                        "follow_up_count": next_count,
                                        "next_follow_up_at": None,
                                        "last_sent_at": datetime.now(timezone.utc),
                                        "last_message_id": msg_id,
                                        "cooling_off_until": datetime.now(timezone.utc) + timedelta(days=45)
                                    }
                                })
                            else:
                                next_time = calculate_next_follow_up(campaign, 3)
                                await r.update({
                                    "$set": {
                                        "follow_up_count": next_count,
                                        "next_follow_up_at": next_time,
                                        "last_sent_at": datetime.now(timezone.utc),
                                        "last_message_id": msg_id
                                    }
                                })
                        sent += 1
                    except Exception as db_exc:
                        logger.error("Failed to update DB after successful send to %s: %s", r.email, db_exc)
                        # Bulletproof fallback using direct asyncpg query to ensure status & next_follow_up_at are saved
                        try:
                            from .database import db_pool
                            if db_pool:
                                async with db_pool.acquire() as conn:
                                    now_utc = datetime.now(timezone.utc)
                                    if not is_follow_up:
                                        next_time = calculate_next_follow_up(campaign, 3)
                                        await conn.execute(
                                            "UPDATE public.recipients SET status = 'sent', follow_up_count = 0, max_follow_ups = $1, next_follow_up_at = $2, send_at = $3, last_sent_at = $3, last_message_id = $4 WHERE id = $5::uuid",
                                            max_fu, next_time, now_utc, msg_id, str(r.id)
                                        )
                                    else:
                                        if next_count >= r.max_follow_ups:
                                            await conn.execute(
                                                "UPDATE public.recipients SET status = 'no_response', follow_up_count = $1, next_follow_up_at = NULL, last_sent_at = $2, last_message_id = $3, cooling_off_until = $4 WHERE id = $5::uuid",
                                                next_count, now_utc, msg_id, now_utc + timedelta(days=45), str(r.id)
                                            )
                                        else:
                                            next_time = calculate_next_follow_up(campaign, 3)
                                            await conn.execute(
                                                "UPDATE public.recipients SET follow_up_count = $1, next_follow_up_at = $2, last_sent_at = $3, last_message_id = $4 WHERE id = $5::uuid",
                                                next_count, next_time, now_utc, msg_id, str(r.id)
                                            )
                        except Exception as direct_sql_exc:
                            logger.critical("Critical error: Emergency raw SQL update failed for %s: %s", r.email, direct_sql_exc)
                        sent += 1

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
                await update_recipient_send_times(campaign.id)

        return {"sent": sent, "failed": failed, "errors": errors, "status": campaign.status if campaign else "deleted"}
    finally:
        if 'config_id_str' in locals() and config_id_str in _active_config_locks:
            _active_config_locks.discard(config_id_str)
        _active_campaign_runs.discard(campaign_id)


async def _run_scheduled_campaigns() -> None:
    """Check for campaigns that are due and fire SMTP sends."""
    from .models import Campaign
    from app.database import db_pool

    try:
        all_campaigns = await Campaign.find().to_list()
    except Exception as e:
        logger.warning("Database query failed in scheduled campaigns check (possible network or DNS blip): %s", e)
        return

    # Trigger background IMAP inbox checks for all active and paused campaigns to keep bounce tracking updated
    for campaign in all_campaigns:
        if campaign.status in ["active", "paused"] and (campaign.email_config_id or campaign.email_config_pool):
            asyncio.create_task(check_imap_inbox_for_updates(campaign))

    candidates = [
        c for c in all_campaigns 
        if c.status in ["draft", "active"] and c.email_config_id
    ]

    now = datetime.now(timezone.utc)

    for campaign in candidates:
        fresh_due = False
        if campaign.send_at:
            try:
                send_dt_str = campaign.send_at.replace("Z", "+00:00")
                send_dt = datetime.fromisoformat(send_dt_str)
                if send_dt.tzinfo is None:
                    send_dt = send_dt.replace(tzinfo=timezone.utc)
                if send_dt <= now:
                    fresh_due = True
            except ValueError:
                logger.warning("Campaign %s has invalid send_at: %s", campaign.id, campaign.send_at)

        # Check if any follow-up is due
        followups_due = False
        try:
            if db_pool:
                async with db_pool.acquire() as conn:
                    # Query for any recipient in this campaign due for follow-up (status='sent' and next_follow_up_at <= now)
                    row = await conn.fetchrow(
                        "SELECT id FROM public.recipients WHERE campaign_id = $1::uuid AND status = 'sent' AND next_follow_up_at IS NOT NULL AND next_follow_up_at <= $2 LIMIT 1",
                        campaign.id,
                        now
                    )
                    if row:
                        followups_due = True
        except Exception as fe:
            logger.warning("Failed to query due follow-ups for campaign %s: %s", campaign.id, fe)

        if not fresh_due and not followups_due:
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

    if campaign.status == "paused" or not campaign.send_at:
        # Clear estimated send times and reset deferred recipients to pending
        async with db_pool.acquire() as conn:
            async with conn.transaction():
                # Clear send_at for pending
                await conn.execute(
                    "UPDATE public.recipients SET send_at = NULL WHERE campaign_id = $1::uuid AND status = 'pending'",
                    campaign.id
                )
                # Reset deferred to pending
                await conn.execute(
                    "UPDATE public.recipients SET status = 'pending', send_at = NULL WHERE campaign_id = $1::uuid AND status = 'deferred'",
                    campaign.id
                )
        return

    # Fetch all pending recipients
    pending_recipients = await Recipient.find(campaign_id=campaign_id, status="pending").to_list()


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

    daily_limit = campaign.daily_fresh_limit or 100
    if daily_limit < 1:
        daily_limit = 1

    mails_per_min = campaign.mails_per_minute or 2
    if mails_per_min < 1:
        mails_per_min = 1
    gap_seconds = 60.0 / mails_per_min

    batch_data = []
    for idx, r in enumerate(pending_recipients):
        day_offset = idx // daily_limit
        if day_offset == 0:
            # Calculate intra-day offset
            intra_day_seconds = idx * gap_seconds
            est_send_time = base_time + timedelta(seconds=intra_day_seconds)
            batch_data.append((est_send_time, r.id))
        else:
            # Do not schedule future days; set send_at to None (NULL in DB)
            batch_data.append((None, r.id))


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


async def check_imap_inbox_for_updates(campaign: Campaign) -> None:
    """Fetch recent IMAP messages and process any replies or bounces."""
    if not campaign or not campaign.email_config_id:
        return
    cfg = await EmailConfig.get(campaign.email_config_id)
    if not cfg or not cfg.imap:
        return
    try:
        from .email_service import fetch_inbox
        messages = await fetch_inbox(cfg, limit=30)
        for msg in messages:
            if not msg.from_addr:
                continue
            sender = msg.from_addr
            if "<" in sender and ">" in sender:
                sender = sender.split("<")[1].split(">")[0].strip()
            sender = sender.strip().lower()
            
            if db_pool:
                async with db_pool.acquire() as conn:
                    rec = await conn.fetchrow(
                        "SELECT id, status, response_category FROM public.recipients WHERE campaign_id = $1::uuid AND LOWER(email) = $2 LIMIT 1",
                        str(campaign.id), sender
                    )
                    if rec and rec["status"] in ("sent", "pending"):
                        subj_lower = msg.subject.lower()
                        if "delivery status" in subj_lower or "undelivered" in subj_lower or "failure" in subj_lower:
                            await conn.execute(
                                "UPDATE public.recipients SET status = 'bounced', response_category = 'bounce', next_follow_up_at = NULL WHERE id = $1::uuid",
                                rec["id"]
                            )
                        elif not rec["response_category"]:
                            await conn.execute(
                                "UPDATE public.recipients SET status = 'replied', response_text = $1, next_follow_up_at = NULL WHERE id = $2::uuid",
                                msg.snippet[:500] if msg.snippet else msg.subject, rec["id"]
                            )
    except Exception as exc:
        logger.warning("check_imap_inbox_for_updates error for campaign %s: %s", campaign.id, exc)
