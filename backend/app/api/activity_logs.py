"""
activity_logs.py  –  /api/v1/activity-logs
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Admin-only audit trail for all campaign-level activity.

Routes
  GET  /              – list logs with filters & pagination (admin only)
  GET  /stats         – aggregate counts by category/severity (admin only)

Exported helper
  log_activity(...)   – fire-and-forget log insertion used by other API modules
"""

import logging
import json
from typing import Optional, Dict, Any
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request, Depends

from .. import models
from .auth import get_current_user_email

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Reusable Helper ─────────────────────────────────────────────────────────

async def log_activity(
    action: str,
    category: str,
    summary: str,
    project_id: Optional[str] = None,
    campaign_id: Optional[str] = None,
    user_email: Optional[str] = None,
    severity: str = "info",
    details: Optional[Dict[str, Any]] = None,
    request: Optional[Request] = None,
) -> None:
    """
    Fire-and-forget insertion of an activity log entry.
    Silently swallows errors so callers are never blocked by logging failures.
    """
    try:
        ip_address = None
        user_agent = None
        if request:
            ip_address = request.client.host if request.client else None
            user_agent = request.headers.get("user-agent")

        entry = models.ActivityLog(
            project_id=project_id or None,
            campaign_id=campaign_id or None,
            user_email=user_email,
            action=action,
            category=category,
            severity=severity,
            summary=summary,
            details=details or {},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await entry.insert()
    except Exception as exc:
        # Never let logging failure propagate to the caller
        logger.warning("⚠️ Failed to write activity log: %s", exc)


# ─── Admin Guard ─────────────────────────────────────────────────────────────

async def _require_admin(email: str) -> models.User:
    """Raise 403 if the authenticated user is not an admin."""
    user = await models.User.find_one(email=email)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_log_stats(
    project_id: Optional[str] = Query(None),
    email: str = Depends(get_current_user_email),
):
    """Aggregate log counts by category and severity for dashboard cards."""
    await _require_admin(email)

    from app.database import db_pool
    if not db_pool:
        raise HTTPException(status_code=500, detail="Database not available")

    async with db_pool.acquire() as conn:
        # Build optional project filter
        where = "WHERE TRUE"
        params: list = []
        idx = 1
        if project_id:
            where += f" AND project_id = ${idx}"
            params.append(project_id)
            idx += 1

        # Total count
        total = await conn.fetchval(
            f"SELECT COUNT(*) FROM activity_logs {where}", *params
        )

        # Counts by category
        category_rows = await conn.fetch(
            f"SELECT category, COUNT(*) as cnt FROM activity_logs {where} GROUP BY category ORDER BY cnt DESC",
            *params,
        )

        # Counts by severity
        severity_rows = await conn.fetch(
            f"SELECT severity, COUNT(*) as cnt FROM activity_logs {where} GROUP BY severity ORDER BY cnt DESC",
            *params,
        )

        # Today's count
        today_where = where + f" AND created_at >= (NOW() AT TIME ZONE 'UTC')::date"
        today_count = await conn.fetchval(
            f"SELECT COUNT(*) FROM activity_logs {today_where}", *params
        )

        # Error count (severity = error or critical)
        error_where = where + f" AND severity IN ('error', 'critical')"
        error_count = await conn.fetchval(
            f"SELECT COUNT(*) FROM activity_logs {error_where}", *params
        )

        # Warning count
        warning_where = where + f" AND severity = 'warning'"
        warning_count = await conn.fetchval(
            f"SELECT COUNT(*) FROM activity_logs {warning_where}", *params
        )

    return {
        "total": total,
        "today": today_count,
        "errors": error_count,
        "warnings": warning_count,
        "by_category": {row["category"]: row["cnt"] for row in category_rows},
        "by_severity": {row["severity"]: row["cnt"] for row in severity_rows},
    }


@router.get("/")
async def list_logs(
    project_id: Optional[str] = Query(None),
    campaign_id: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),   # ISO date e.g. 2026-07-01
    date_to: Optional[str] = Query(None),     # ISO date e.g. 2026-07-10
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    email: str = Depends(get_current_user_email),
):
    """List activity logs with filtering, searching, and pagination. Admin only."""
    await _require_admin(email)

    from app.database import db_pool
    if not db_pool:
        raise HTTPException(status_code=500, detail="Database not available")

    async with db_pool.acquire() as conn:
        where_clauses = ["TRUE"]
        params: list = []
        idx = 1

        if project_id:
            where_clauses.append(f"project_id = ${idx}")
            params.append(project_id)
            idx += 1

        if campaign_id:
            where_clauses.append(f"campaign_id = ${idx}")
            params.append(campaign_id)
            idx += 1

        if category:
            where_clauses.append(f"category = ${idx}")
            params.append(category)
            idx += 1

        if severity:
            where_clauses.append(f"severity = ${idx}")
            params.append(severity)
            idx += 1

        if search:
            where_clauses.append(f"(summary ILIKE ${idx} OR action ILIKE ${idx} OR user_email ILIKE ${idx})")
            params.append(f"%{search}%")
            idx += 1

        if date_from:
            where_clauses.append(f"created_at >= ${idx}::timestamptz")
            params.append(f"{date_from}T00:00:00Z")
            idx += 1

        if date_to:
            where_clauses.append(f"created_at <= ${idx}::timestamptz")
            params.append(f"{date_to}T23:59:59Z")
            idx += 1

        where_str = " AND ".join(where_clauses)

        # Total count for pagination metadata
        total = await conn.fetchval(
            f"SELECT COUNT(*) FROM activity_logs WHERE {where_str}", *params
        )

        # Fetch page
        params.append(limit)
        params.append(offset)
        rows = await conn.fetch(
            f"""SELECT * FROM activity_logs
                WHERE {where_str}
                ORDER BY created_at DESC
                LIMIT ${idx} OFFSET ${idx + 1}""",
            *params,
        )

        logs = []
        for row in rows:
            d = dict(row)
            # Convert UUID/datetime for JSON serialization
            for k, v in d.items():
                if hasattr(v, "hex"):
                    d[k] = str(v)
                elif isinstance(v, datetime):
                    d[k] = v.isoformat()
            # Parse JSONB details
            if isinstance(d.get("details"), str):
                try:
                    d["details"] = json.loads(d["details"])
                except (json.JSONDecodeError, TypeError):
                    pass
            logs.append(d)

    return {
        "logs": logs,
        "total": total,
        "limit": limit,
        "offset": offset,
    }
"""Exported helper for other modules to import."""
