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
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from app.api.auth import get_current_user_email

from .. import models, schemas
from ..email_service import send_email
from .activity_logs import log_activity

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
        daily_limit=config.daily_limit,
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


async def _assert_config_access(config_id: str, email: str) -> models.EmailConfig:
    cfg = await _get_or_404(config_id)
    user = await models.User.find_one(email=email)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.role != "admin":
        member = await models.ProjectMember.find_one(user_id=user.id, project_id=cfg.project_id)
        if not member:
            raise HTTPException(status_code=403, detail="You do not have access to this configuration's project.")
    return cfg


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[schemas.EmailConfigOut])
async def list_email_configs(
    project_id: Optional[str] = Query(None),
    current_user_email: str = Depends(get_current_user_email)
):
    user = await models.User.find_one(email=current_user_email)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
        
    if user.role == "admin":
        if project_id:
            configs = await models.EmailConfig.find(project_id=project_id).to_list()
        else:
            configs = await models.EmailConfig.find_all().to_list()
        return [_mask(c) for c in configs]
        
    # Non-admin users: get their projects
    memberships = await models.ProjectMember.find(user_id=user.id).to_list()
    project_ids = {m.project_id for m in memberships}
    
    if project_id:
        if project_id not in project_ids:
            raise HTTPException(status_code=403, detail="You do not have access to this project.")
        configs = await models.EmailConfig.find(project_id=project_id).to_list()
        return [_mask(c) for c in configs]
        
    all_configs = await models.EmailConfig.find_all().to_list()
    return [_mask(c) for c in all_configs if c.project_id in project_ids]


@router.post("/", response_model=schemas.EmailConfigOut, status_code=201)
async def create_email_config(
    payload: schemas.EmailConfigCreate,
    current_user_email: str = Depends(get_current_user_email)
):
    """
    Create an EmailConfig with SMTP (required) and optional IMAP settings.
    """
    user = await models.User.find_one(email=current_user_email)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    project_id = payload.project_id
    if not project_id:
        # Fallback to first available project
        if user.role == "admin":
            first_project = await models.Project.find_all().limit(1).to_list()
            project_id = first_project[0].id if first_project else None
        else:
            memberships = await models.ProjectMember.find(user_id=user.id).limit(1).to_list()
            project_id = memberships[0].project_id if memberships else None

    if not project_id:
        raise HTTPException(status_code=400, detail="No active project context found. Please create a project first.")

    # Assert project access
    if user.role != "admin":
        member = await models.ProjectMember.find_one(user_id=user.id, project_id=project_id)
        if not member:
            raise HTTPException(status_code=403, detail="You do not have access to this project.")

    # If marked active, deactivate all existing ones for the same project first
    if payload.is_active:
        active_configs = await models.EmailConfig.find(project_id=project_id, is_active=True).to_list()
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
        daily_limit=payload.daily_limit,
        project_id=project_id,
    )
    await db_config.insert()
    logger.info("EmailConfig created: %s (%s)", db_config.name, db_config.sender_address)
    await log_activity(
        action="config_created",
        category="config",
        summary=f"Email config '{db_config.name}' ({db_config.sender_address}) created",
        project_id=project_id,
        user_email=current_user_email,
        details={"config_name": db_config.name, "sender_address": db_config.sender_address, "provider": db_config.provider},
    )
    return _mask(db_config)


@router.get("/{config_id}", response_model=schemas.EmailConfigOut)
async def get_email_config(config_id: str, current_user_email: str = Depends(get_current_user_email)):
    return _mask(await _assert_config_access(config_id, current_user_email))


@router.patch("/{config_id}", response_model=schemas.EmailConfigOut)
async def update_email_config(config_id: str, payload: schemas.EmailConfigUpdate, current_user_email: str = Depends(get_current_user_email)):
    cfg = await _assert_config_access(config_id, current_user_email)

    if payload.project_id is not None:
        user = await models.User.find_one(email=current_user_email)
        if user.role != "admin":
            member = await models.ProjectMember.find_one(user_id=user.id, project_id=payload.project_id)
            if not member:
                raise HTTPException(status_code=403, detail="You do not have access to the target project.")

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
    if payload.daily_limit is not None:
        updates["daily_limit"] = payload.daily_limit
    if payload.smtp is not None:
        updates["smtp"] = models.SmtpSettings(**payload.smtp.model_dump())
    if payload.imap is not None:
        updates["imap"] = models.ImapSettings(**payload.imap.model_dump())
    if payload.project_id is not None:
        updates["project_id"] = payload.project_id

    if updates:
        await cfg.update({"$set": updates})
        await log_activity(
            action="config_updated",
            category="config",
            summary=f"Email config '{cfg.name}' updated (fields: {', '.join(updates.keys())})",
            project_id=cfg.project_id,
            user_email=current_user_email,
            details={"updated_fields": list(updates.keys())},
        )

    return _mask(cfg)


@router.delete("/{config_id}", status_code=204)
async def delete_email_config(config_id: str, current_user_email: str = Depends(get_current_user_email)):
    cfg = await _assert_config_access(config_id, current_user_email)
    config_name = cfg.name
    project_id = cfg.project_id
    await cfg.delete()
    await log_activity(
        action="config_deleted",
        category="config",
        summary=f"Email config '{config_name}' deleted",
        project_id=project_id,
        user_email=current_user_email,
        severity="warning",
        details={"config_name": config_name, "config_id": config_id},
    )


@router.post("/{config_id}/test")
async def test_email_config(config_id: str, to_address: str, current_user_email: str = Depends(get_current_user_email)):
    """
    Send a single test email using this config's SMTP credentials.
    Use ?to_address=you@example.com
    """
    cfg = await _assert_config_access(config_id, current_user_email)
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
            server.ehlo()
            server.starttls()
            server.ehlo()
        else:
            server = smtplib.SMTP_SSL(req.host, req.port, timeout=10)
            server.ehlo()
        server.login(req.username, req.password)
        server.quit()

    try:
        await asyncio.to_thread(_connect)
        return {"success": True, "detail": f"Connected to {req.host}:{req.port} ✅"}
    except Exception as exc:
        return {"success": False, "detail": str(exc)}


class ConnectionTestRequest(_BM):
    smtp_host: str
    smtp_port: int = 587
    smtp_username: str
    smtp_password: str
    smtp_use_tls: bool = True
    
    enable_imap: bool = False
    imap_host: Optional[str] = None
    imap_port: Optional[int] = 993
    imap_username: Optional[str] = None
    imap_password: Optional[str] = None
    imap_use_ssl: bool = True


@router.post("/test-connection")
async def test_connection(req: ConnectionTestRequest):
    """
    Validate both SMTP and IMAP credentials inline (no config saved).
    Provides feedback for both channels.
    """
    import smtplib
    import imaplib
    import asyncio

    smtp_ok = False
    smtp_err = None
    imap_ok = False
    imap_err = None

    def _test_smtp():
        nonlocal smtp_ok, smtp_err
        try:
            if req.smtp_use_tls:
                server = smtplib.SMTP(req.smtp_host, req.smtp_port, timeout=10)
                server.ehlo()
                server.starttls()
                server.ehlo()
            else:
                server = smtplib.SMTP_SSL(req.smtp_host, req.smtp_port, timeout=10)
                server.ehlo()
            server.login(req.smtp_username, req.smtp_password)
            server.quit()
            smtp_ok = True
        except Exception as e:
            smtp_err = str(e)

    def _test_imap():
        nonlocal imap_ok, imap_err
        try:
            if not req.imap_host:
                imap_err = "No IMAP host provided."
                return
            
            if req.imap_use_ssl:
                mail = imaplib.IMAP4_SSL(req.imap_host, req.imap_port, timeout=10)
            else:
                mail = imaplib.IMAP4(req.imap_host, req.imap_port, timeout=10)
            
            mail.login(req.imap_username or req.smtp_username, req.imap_password or req.smtp_password)
            mail.logout()
            imap_ok = True
        except Exception as e:
            imap_err = str(e)

    await asyncio.to_thread(_test_smtp)
    if req.enable_imap:
        await asyncio.to_thread(_test_imap)
    else:
        imap_ok = True

    return {
        "smtp": {"success": smtp_ok, "error": smtp_err},
        "imap": {"success": imap_ok, "error": imap_err},
        "success": smtp_ok and imap_ok
    }


