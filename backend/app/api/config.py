"""
config.py  –  /api/v1/config
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Manage EmailConfig documents — each holds SMTP + optional IMAP credentials
for one email account (Gmail, G Suite, Outlook, or any custom SMTP provider).

Routes
  GET    /           – list all configs
  POST   /           – create a new email config (SMTP + optional IMAP)
  GET    /{id}       – get a single config (passwords masked)
  PATCH  /{id}       – update any field
  DELETE /{id}       – remove config
  POST   /{id}/test  – send a one-shot test email to validate SMTP credentials
"""

import logging
from typing import List

from fastapi import APIRouter, HTTPException

from .. import models, schemas
from ..email_service import send_email

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _mask(config: models.EmailConfig) -> schemas.EmailConfigOut:
    """Return a safe response — never expose raw passwords."""
    return schemas.EmailConfigOut(
        id=str(config.id),
        name=config.name,
        provider=config.provider,
        sender_address=config.sender_address,
        sender_name=config.sender_name,
        is_active=config.is_active,
        created_at=config.created_at,
        smtp_host=config.smtp.host,
        smtp_port=config.smtp.port,
        imap_host=config.imap.host if config.imap else None,
        imap_port=config.imap.port if config.imap else None,
    )


async def _get_or_404(config_id: str) -> models.EmailConfig:
    cfg = await models.EmailConfig.get(config_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="EmailConfig not found")
    return cfg


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[schemas.EmailConfigOut])
async def list_email_configs():
    configs = await models.EmailConfig.find_all().to_list()
    return [_mask(c) for c in configs]


@router.post("/", response_model=schemas.EmailConfigOut, status_code=201)
async def create_email_config(payload: schemas.EmailConfigCreate):
    """
    Create an EmailConfig with SMTP (required) and optional IMAP settings.

    Example body for G Suite / Gmail:
    ```json
    {
      "name": "Sales Gmail",
      "provider": "google",
      "sender_address": "sales@example.com",
      "sender_name": "Sales Team",
      "smtp": {
        "host": "smtp.gmail.com",
        "port": 587,
        "username": "sales@example.com",
        "password": "<App Password>",
        "use_tls": true
      },
      "imap": {
        "host": "imap.gmail.com",
        "port": 993,
        "username": "sales@example.com",
        "password": "<App Password>",
        "use_ssl": true
      }
    }
    ```
    """
    # If marked active, deactivate all existing ones first
    if payload.is_active:
        active_configs = await models.EmailConfig.find(is_active=True).to_list()
        for cfg in active_configs:
            await cfg.update({"is_active": False})

    smtp_settings = models.SmtpSettings(**payload.smtp.model_dump())
    imap_settings = models.ImapSettings(**payload.imap.model_dump()) if payload.imap else None

    db_config = models.EmailConfig(
        name=payload.name,
        provider=payload.provider,
        sender_address=payload.sender_address,
        sender_name=payload.sender_name,
        smtp=smtp_settings,
        imap=imap_settings,
        is_active=payload.is_active,
    )
    await db_config.insert()
    logger.info("EmailConfig created: %s (%s)", db_config.name, db_config.sender_address)
    return _mask(db_config)


@router.get("/{config_id}", response_model=schemas.EmailConfigOut)
async def get_email_config(config_id: str):
    return _mask(await _get_or_404(config_id))


@router.patch("/{config_id}", response_model=schemas.EmailConfigOut)
async def update_email_config(config_id: str, payload: schemas.EmailConfigUpdate):
    cfg = await _get_or_404(config_id)

    updates: dict = {}
    if payload.name is not None:
        updates["name"] = payload.name
    if payload.provider is not None:
        updates["provider"] = payload.provider
    if payload.sender_address is not None:
        updates["sender_address"] = str(payload.sender_address)
    if payload.sender_name is not None:
        updates["sender_name"] = payload.sender_name
    if payload.is_active is not None:
        updates["is_active"] = payload.is_active
    if payload.smtp is not None:
        updates["smtp"] = models.SmtpSettings(**payload.smtp.model_dump())
    if payload.imap is not None:
        updates["imap"] = models.ImapSettings(**payload.imap.model_dump())

    if updates:
        await cfg.update({"$set": updates})

    return _mask(cfg)


@router.delete("/{config_id}", status_code=204)
async def delete_email_config(config_id: str):
    cfg = await _get_or_404(config_id)
    await cfg.delete()


@router.post("/{config_id}/test")
async def test_email_config(config_id: str, to_address: str):
    """
    Send a single test email using this config's SMTP credentials.
    Use ?to_address=you@example.com
    """
    cfg = await _get_or_404(config_id)
    try:
        await send_email(
            config=cfg,
            to_address=to_address,
            subject="✅ SMTP Test — EmailSaaS",
            body=(
                f"This is a test message from EmailSaaS.\n\n"
                f"Config: {cfg.name}\n"
                f"Provider: {cfg.provider}\n"
                f"From: {cfg.sender_address}\n"
                f"SMTP host: {cfg.smtp.host}:{cfg.smtp.port}\n"
            ),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"SMTP test failed: {exc}")

    return {"detail": f"Test email sent to {to_address} via {cfg.smtp.host}:{cfg.smtp.port}"}


# ─── Test raw credentials without saving ─────────────────────────────────────

from pydantic import BaseModel as _BM

class SmtpTestRequest(_BM):
    host: str
    port: int = 587
    username: str
    password: str
    use_tls: bool = True


@router.post("/test-smtp")
async def test_smtp_credentials(req: SmtpTestRequest):
    """
    Validate SMTP credentials inline (no config saved).
    Called by the EmailConfigPanel form 'Test Connection' button.
    """
    import smtplib
    import asyncio

    def _connect():
        if req.use_tls:
            server = smtplib.SMTP(req.host, req.port, timeout=10)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(req.host, req.port, timeout=10)
        server.login(req.username, req.password)
        server.quit()

    try:
        await asyncio.to_thread(_connect)
        return {"success": True, "detail": f"Connected to {req.host}:{req.port} ✅"}
    except Exception as exc:
        return {"success": False, "detail": str(exc)}

