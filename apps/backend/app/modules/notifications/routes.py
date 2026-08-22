"""Notification API routes — per-user in-app notification stream.

All endpoints require authentication; every user sees only their own
notifications. Read state is per-user and per-notification — there is no
shared stream.

Endpoints:
  GET   /notifications                — list (paginated, newest first)
  GET   /notifications/unread-count    — unread count
  PATCH /notifications/read-all        — mark all unread as read
  PATCH /notifications/{id}/read       — mark one as read
  DELETE /notifications/{id}           — delete one

Listing is scoped to ``user_id`` AND ``tenant_id`` so a misconfigured
tenant context can never leak another tenant's notifications even if
the user_id collided (defense in depth — RLS already enforces this in
production PostgreSQL).
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tenant_id, get_current_user
from app.core.db import get_db, paginate
from app.models import User
from app.modules.notifications.models import Notification
from app.modules.notifications.schemas import (
    MessageResponse,
    NotificationListResponse,
    NotificationResponse,
    ReadAllResponse,
    UnreadCountResponse,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


def _tenant_filter(user: User) -> tuple[UUID, int]:
    """Resolve (tenant_id, user_id) for scoping queries.

    tenant_id is required because the notifications table is RLS-scoped;
    a missing tenant context means the request is malformed.
    """
    tenant_id = get_current_tenant_id()
    if tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context not resolved",
        )
    return tenant_id, user.id


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationListResponse:
    """List the current user's notifications, newest first."""
    tenant_id, user_id = _tenant_filter(current_user)
    base = select(Notification).where(
        Notification.tenant_id == tenant_id,
        Notification.user_id == user_id,
    )
    rows, meta = await paginate(
        db,
        base,
        page=page,
        page_size=page_size,
        # 同一时间戳（SQLite 秒级精度）内按 id 倒序决胜，保证「最新优先」
        # 在并发/快速连写下依然成立。
        order_by=(desc(Notification.created_at), Notification.id.desc()),
    )
    return NotificationListResponse(
        data=[NotificationResponse.model_validate(r) for r in rows],
        meta=meta,
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
async def unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UnreadCountResponse:
    """Count the current user's unread notifications."""
    tenant_id, user_id = _tenant_filter(current_user)
    result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.tenant_id == tenant_id,
            Notification.user_id == user_id,
            Notification.is_read.is_(False),
        )
    )
    return UnreadCountResponse(unread=result.scalar_one())


@router.patch("/read-all", response_model=ReadAllResponse)
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReadAllResponse:
    """Mark every unread notification of the current user as read."""
    tenant_id, user_id = _tenant_filter(current_user)
    result: Any = await db.execute(
        update(Notification)
        .where(
            Notification.tenant_id == tenant_id,
            Notification.user_id == user_id,
            Notification.is_read.is_(False),
        )
        .values(is_read=True)
    )
    await db.commit()
    return ReadAllResponse(updated=result.rowcount or 0)


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationResponse:
    """Mark one notification as read (must belong to the current user)."""
    tenant_id, user_id = _tenant_filter(current_user)
    entry = (
        await db.execute(
            select(Notification).where(
                Notification.tenant_id == tenant_id,
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )
    entry.is_read = True
    await db.commit()
    await db.refresh(entry)
    return NotificationResponse.model_validate(entry)


@router.delete(
    "/{notification_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
)
async def delete_notification(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Delete one notification (must belong to the current user)."""
    tenant_id, user_id = _tenant_filter(current_user)
    entry = (
        await db.execute(
            select(Notification).where(
                Notification.tenant_id == tenant_id,
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )
    await db.delete(entry)
    await db.commit()
    return MessageResponse(message="Notification deleted")
