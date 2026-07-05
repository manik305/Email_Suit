"""
email_service.py
~~~~~~~~~~~~~~~~
Provides async-friendly helpers and a batch-capable SMTP session:

  • send_email()    – one-shot async send (used by test/config endpoints)
  • SmtpSession     – persistent SMTP connection for bulk campaign sends
  • fetch_inbox()   – reads the campaign INBOX via IMAP SSL
  • send_email_batch() – sends a batch of emails reusing a connection

Design notes
────────────
• SmtpSession keeps the TCP connection alive across `batch_size` emails
  (default 50) and then re-authenticates.  This eliminates the per-email
  AUTH call that was triggering Google's anti-abuse detection.
• Both send paths share _build_mime_message() for consistent tracking
  pixel injection and link rewriting.
• All blocking socket I/O runs inside asyncio.to_thread() so it never
  blocks the event loop.
• Credentials stay inside EmailConfig — never hardcoded here.
"""

import asyncio
import email as stdlib_email
import imaplib
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional, Union

from .models import EmailConfig
from .schemas import InboxMessage

logger = logging.getLogger(__name__)


import os
import re
import urllib.parse

# ─── Link rewriting helpers ────────────────────────────────────────────────────

def _rewrite_links_in_text(text: str, recipient_id: str, base_url: str) -> str:
    def replace_url(match):
        url = match.group(0)
        if "/api/track/" in url or "unsubscribe" in url:
            return url
        return f"{base_url}/api/track/click/{recipient_id}?target={urllib.parse.quote(url)}"
    return re.sub(r'https?://[^\s<"\']+', replace_url, text)

def _rewrite_links_in_html(html: str, recipient_id: str, base_url: str) -> str:
    def replace_link(match):
        prefix = match.group(1)
        url = match.group(2)
        suffix = match.group(3)
        if "/api/track/" in url or "unsubscribe" in url:
            return match.group(0)
        return f'{prefix}{base_url}/api/track/click/{recipient_id}?target={urllib.parse.quote(url)}{suffix}'
    return re.sub(r'(href=["\'])(https?://[^"\']*)(["\']])', replace_link, html)


# ─── Shared message builder ────────────────────────────────────────────────────

def _build_mime_message(
    config: EmailConfig,
    to_address: str,
    subject: str,
    body: str,
    html_body: Optional[str],
    recipient_id: Optional[str],
) -> MIMEMultipart:
    """
    Build a MIME email message with tracking pixel and rewritten links injected.
    Returns the fully assembled MIMEMultipart object.
    """
    base_url = os.getenv("TRACKING_BASE_URL", "http://localhost:8000").rstrip("/")

    if recipient_id:
        body = _rewrite_links_in_text(body, recipient_id, base_url)
        if not html_body:
            html_body = body.replace("\n", "<br/>")
        html_body = _rewrite_links_in_html(html_body, recipient_id, base_url)
        tracking_pixel = (
            f'<img src="{base_url}/api/track/open/{recipient_id}" '
            f'width="1" height="1" style="display:none !important;" alt="" />'
        )
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

    return msg


# ─── One-shot SMTP send (kept for test / config endpoints) ────────────────────

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
    msg = _build_mime_message(config, to_address, subject, body, html_body, recipient_id)

    if smtp_cfg.use_tls:
        with smtplib.SMTP(smtp_cfg.host, smtp_cfg.port, timeout=20) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_cfg.username, smtp_cfg.password)
            server.sendmail(config.sender_address, to_address, msg.as_string())
    else:
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


# ─── Persistent SMTP Session (for bulk campaign sends) ────────────────────────

class SmtpSession:
    """
    Maintains a persistent SMTP connection across a batch of emails.

    Re-opens and re-authenticates after every `batch_size` sends to avoid
    idle-connection timeouts while still eliminating the per-email AUTH
    overhead that triggers Google's anti-abuse detection.

    Usage (inside asyncio.to_thread or sync context):
        session = SmtpSession(config, batch_size=50)
        try:
            session.send_message(to, subject, body, html_body, recipient_id)
            # ... more sends
        finally:
            session.close()

    All send_message() calls are blocking — wrap in asyncio.to_thread().
    """

    def __init__(self, config: EmailConfig, batch_size: int = 50) -> None:
        self._config = config
        self._batch_size = batch_size
        self._server: Optional[Union[smtplib.SMTP, smtplib.SMTP_SSL]] = None
        self._send_count: int = 0

    # ── Private connection helpers ──

    def _open(self) -> Union[smtplib.SMTP, smtplib.SMTP_SSL]:
        smtp_cfg = self._config.smtp
        if smtp_cfg.use_tls:
            server = smtplib.SMTP(smtp_cfg.host, smtp_cfg.port, timeout=30)
            server.ehlo()
            server.starttls()
            server.ehlo()
        else:
            server = smtplib.SMTP_SSL(smtp_cfg.host, smtp_cfg.port, timeout=30)
            server.ehlo()
        server.login(smtp_cfg.username, smtp_cfg.password)
        logger.debug(
            "🔌 SMTP session opened → %s:%s (account: %s)",
            smtp_cfg.host, smtp_cfg.port, smtp_cfg.username,
        )
        return server

    def _close(self) -> None:
        if self._server:
            try:
                self._server.quit()
            except Exception:
                pass
            finally:
                self._server = None
                self._send_count = 0

    def _ensure_connected(self) -> None:
        """Rotate the connection after batch_size sends or if disconnected."""
        if self._server is None or self._send_count >= self._batch_size:
            self._close()
            self._server = self._open()

    # ── Public API ──

    def send_message(
        self,
        to_address: str,
        subject: str,
        body: str,
        html_body: Optional[str] = None,
        recipient_id: Optional[str] = None,
    ) -> None:
        """
        Send one email over the persistent connection.
        Blocking — must be called inside asyncio.to_thread().
        """
        self._ensure_connected()
        msg = _build_mime_message(
            self._config, to_address, subject, body, html_body, recipient_id
        )
        assert self._server is not None
        self._server.sendmail(
            self._config.sender_address, to_address, msg.as_string()
        )
        self._send_count += 1
        logger.info(
            "✉️  [session] Email sent to %s via %s (connection send #%d/%d)",
            to_address,
            self._config.smtp.host,
            self._send_count,
            self._batch_size,
        )

    def close(self) -> None:
        """Explicitly close and clean up the SMTP connection."""
        self._close()
        logger.debug("🔌 SMTP session closed.")


# ─── IMAP ─────────────────────────────────────────────────────────────────────

def _fetch_inbox_sync(config: EmailConfig, mailbox: str = "INBOX", limit: int = 20) -> List[InboxMessage]:
    """Blocking IMAP read — called inside asyncio.to_thread()."""
    if config.imap is None:
        raise ValueError("No IMAP configuration attached to this EmailConfig.")

    imap_cfg = config.imap
    messages: List[InboxMessage] = []

    if imap_cfg.use_ssl:
        client = imaplib.IMAP4_SSL(imap_cfg.host, imap_cfg.port)
    else:
        client = imaplib.IMAP4(imap_cfg.host, imap_cfg.port)

    with client as mail:
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


def _send_email_batch_sync(
    config: EmailConfig,
    recipients_payloads: List[dict],
    batch_size: int = 50,
) -> tuple:
    """
    Sends a batch of emails reusing a single SMTP connection.
    recipients_payloads: List of dicts with keys: to_address, subject, body, html_body, recipient_id
    """
    sent = 0
    failed = 0
    errors = []
    session = SmtpSession(config, batch_size=batch_size)
    try:
        for payload in recipients_payloads:
            try:
                session.send_message(
                    to_address=payload["to_address"],
                    subject=payload["subject"],
                    body=payload["body"],
                    html_body=payload.get("html_body"),
                    recipient_id=payload.get("recipient_id"),
                )
                sent += 1
            except Exception as e:
                failed += 1
                errors.append({"email": payload["to_address"], "error": str(e)})
    finally:
        session.close()
    return sent, failed, errors


async def send_email_batch(
    config: EmailConfig,
    recipients_payloads: List[dict],
    batch_size: int = 50,
) -> tuple:
    """Async wrapper around _send_email_batch_sync."""
    return await asyncio.to_thread(_send_email_batch_sync, config, recipients_payloads, batch_size)
