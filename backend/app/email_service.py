"""
email_service.py
~~~~~~~~~~~~~~~~
Provides two async-friendly helpers:
  • send_email()  – sends via SMTP (STARTTLS or SSL) using campaign EmailConfig
  • fetch_inbox() – reads the campaign INBOX via IMAP SSL

Design notes
────────────
• Both helpers accept an EmailConfig document.  Campaign routes look up the
  config by campaign.email_config_id before calling these.
• All blocking socket I/O runs inside asyncio.to_thread() so it never blocks
  the event loop.
• Credentials stay inside EmailConfig — never hardcoded here.
"""

import asyncio
import email as stdlib_email
import imaplib
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional

from .models import EmailConfig
from .schemas import InboxMessage

logger = logging.getLogger(__name__)


import os
import re
import urllib.parse

# ─── SMTP ─────────────────────────────────────────────────────────────────────

def _rewrite_links_in_text(text: str, recipient_id: str, base_url: str) -> str:
    def replace_url(match):
        url = match.group(0)
        if "/api/track/" in url or "unsubscribe" in url:
            return url
        return f"{base_url}/api/track/click/{recipient_id}?target={urllib.parse.quote(url)}"
    # Regex to find http/https links
    return re.sub(r'https?://[^\s<"\']+', replace_url, text)

def _rewrite_links_in_html(html: str, recipient_id: str, base_url: str) -> str:
    def replace_link(match):
        prefix = match.group(1)
        url = match.group(2)
        suffix = match.group(3)
        if "/api/track/" in url or "unsubscribe" in url:
            return match.group(0)
        return f'{prefix}{base_url}/api/track/click/{recipient_id}?target={urllib.parse.quote(url)}{suffix}'
    return re.sub(r'(href=["\'])(https?://[^"\']*)(["\'])', replace_link, html)


def _send_email_sync(
    config: EmailConfig,
    to_address: str,
    subject: str,
    body: str,
    html_body: Optional[str] = None,
    recipient_id: Optional[str] = None,
) -> None:
    """Blocking SMTP delivery — called inside asyncio.to_thread()."""
    smtp_cfg = config.smtp
    base_url = os.getenv("TRACKING_BASE_URL", "http://localhost:8000").rstrip("/")

    if recipient_id:
        # Rewrite links in plain text body
        body = _rewrite_links_in_text(body, recipient_id, base_url)
        
        # If no html_body is provided, generate a basic one from plain text body
        if not html_body:
            html_body = body.replace("\n", "<br/>")

        # Rewrite links in HTML body
        html_body = _rewrite_links_in_html(html_body, recipient_id, base_url)

        # Inject tracking pixel at the end of html_body
        tracking_pixel = f'<img src="{base_url}/api/track/open/{recipient_id}" width="1" height="1" style="display:none !important;" alt="" />'
        if "</body>" in html_body:
            html_body = html_body.replace("</body>", f"{tracking_pixel}</body>")
        else:
            html_body = html_body + tracking_pixel

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = (
        f"{config.sender_name} <{config.sender_address}>"
        if config.sender_name
        else config.sender_address
    )
    msg["To"] = to_address

    msg.attach(MIMEText(body, "plain"))
    if html_body:
        msg.attach(MIMEText(html_body, "html"))

    if smtp_cfg.use_tls:
        # Port 587 → STARTTLS
        with smtplib.SMTP(smtp_cfg.host, smtp_cfg.port, timeout=20) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_cfg.username, smtp_cfg.password)
            server.sendmail(config.sender_address, to_address, msg.as_string())
    else:
        # Port 465 → SSL
        with smtplib.SMTP_SSL(smtp_cfg.host, smtp_cfg.port, timeout=20) as server:
            server.login(smtp_cfg.username, smtp_cfg.password)
            server.sendmail(config.sender_address, to_address, msg.as_string())

    logger.info("✉️  Email sent to %s via %s:%s", to_address, smtp_cfg.host, smtp_cfg.port)


async def send_email(
    config: EmailConfig,
    to_address: str,
    subject: str,
    body: str,
    html_body: Optional[str] = None,
    recipient_id: Optional[str] = None,
) -> None:
    """Async wrapper around _send_email_sync."""
    await asyncio.to_thread(
        _send_email_sync, config, to_address, subject, body, html_body, recipient_id
    )


# ─── IMAP ─────────────────────────────────────────────────────────────────────

def _fetch_inbox_sync(config: EmailConfig, mailbox: str = "INBOX", limit: int = 20) -> List[InboxMessage]:
    """Blocking IMAP read — called inside asyncio.to_thread()."""
    if config.imap is None:
        raise ValueError("No IMAP configuration attached to this EmailConfig.")

    imap_cfg = config.imap
    messages: List[InboxMessage] = []

    with imaplib.IMAP4_SSL(imap_cfg.host, imap_cfg.port) as mail:
        mail.login(imap_cfg.username, imap_cfg.password)
        mail.select(mailbox)

        # Search for all messages; take the N most-recent
        status, data = mail.search(None, "ALL")
        if status != "OK":
            return messages

        uids = data[0].split()
        recent_uids = uids[-limit:]  # last N UIDs

        for uid in reversed(recent_uids):
            status, msg_data = mail.fetch(uid, "(RFC822)")
            if status != "OK":
                continue

            raw = msg_data[0][1]
            parsed = stdlib_email.message_from_bytes(raw)

            subject = parsed.get("Subject", "(no subject)")
            from_addr = parsed.get("From", "")
            date_str = parsed.get("Date", "")

            # Extract plain-text snippet and full body
            full_body = ""
            if parsed.is_multipart():
                for part in parsed.walk():
                    ctype = part.get_content_type()
                    cdisp = str(part.get("Content-Disposition"))
                    if ctype == "text/plain" and "attachment" not in cdisp:
                        payload = part.get_payload(decode=True)
                        if payload:
                            full_body = payload.decode(errors="replace")
                            break
                if not full_body:
                    # try html fallback
                    for part in parsed.walk():
                        if part.get_content_type() == "text/html":
                            payload = part.get_payload(decode=True)
                            if payload:
                                full_body = payload.decode(errors="replace")
                                break
            else:
                payload = parsed.get_payload(decode=True)
                if payload:
                    full_body = payload.decode(errors="replace")

            snippet = full_body[:200] if full_body else ""

            messages.append(
                InboxMessage(
                    uid=uid.decode(),
                    subject=subject,
                    from_addr=from_addr,
                    date=date_str,
                    snippet=snippet.strip(),
                    body=full_body.strip() if full_body else snippet.strip()
                )
            )

    logger.info(
        "📬  Fetched %d messages from %s/%s via IMAP", len(messages), imap_cfg.host, mailbox
    )
    return messages


async def fetch_inbox(
    config: EmailConfig, mailbox: str = "INBOX", limit: int = 20
) -> List[InboxMessage]:
    """Async wrapper around _fetch_inbox_sync."""
    return await asyncio.to_thread(_fetch_inbox_sync, config, mailbox, limit)
