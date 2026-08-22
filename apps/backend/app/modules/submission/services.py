"""Submission domain services — shared business logic for route modules.

Routes stay thin: parameter validation + serialization. Everything that
touches ORM state, transactions or cross-module construction lives here so
both the author-side and editor-side routers share one implementation.

Split out of the former monolithic ``routes.py`` (see 0.2.0 changelog);
API paths and behaviour are unchanged.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_tenant_id
from app.core import search as fulltext
from app.core.db import paginate
from app.modules.catalog.models import Resource
from app.modules.submission.models import Submission, SubmissionVersion
from app.modules.submission.schemas import (
    SubmissionListResponse,
    SubmissionResponse,
)

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


async def get_submission_or_404(
    db: AsyncSession, submission_id: int
) -> Submission:
    """Fetch a submission by id (scoped to current tenant) or raise 404."""
    tenant_id = require_tenant_id()
    entry = (
        await db.execute(
            select(Submission).where(
                Submission.id == submission_id,
                Submission.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found",
        )
    return entry


async def materialize_resource_from_submission(
    db: AsyncSession, submission: Submission
) -> Resource:
    """Create a catalog Resource from a submission payload.

    Calls the same shape the catalog admin POST endpoint expects, so the
    conversion logic (preview truncation, defaults, etc.) stays where
    Resource creation belongs. We construct the ORM Resource directly
    rather than re-routing through the HTTP layer to keep it
    transactional with the review commit.
    """
    resource = Resource(
        tenant_id=submission.tenant_id,
        type=submission.type,
        title=submission.title,
        authors=submission.authors,
        year=submission.year,
        venue=submission.venue,
        discipline=submission.discipline,
        subdiscipline=submission.subdiscipline,
        tags=submission.tags,
        abstract=submission.abstract,
        preview=submission.preview,
        download_url=submission.download_url,
        external_url=submission.external_url,
        doi=submission.doi,
        # 物化时把 submission 的 keywords 带过去
        keywords=submission.keywords or None,
    )
    db.add(resource)
    await db.flush()
    # 同步全文索引（best-effort）。即使后续事务回滚产生幽灵文档也无害：
    # 搜索路由按 id 回读 DB，查不到的命中会被静默丢弃。
    await fulltext.index_resource(resource)
    return resource


async def resolve_resource_for_approval(
    db: AsyncSession,
    entry: Submission,
    resource_id: int | None,
    tenant_id: Any,
) -> None:
    """Link an existing catalog Resource, or materialize a new one.

    ``resource_id`` provided  → it must point to a Resource in the same
    tenant; the submission is linked to it. Otherwise a new Resource is
    materialized from the submission payload.
    """
    if resource_id is not None:
        existing = (
            await db.execute(
                select(Resource).where(
                    Resource.id == resource_id,
                    Resource.tenant_id == tenant_id,
                )
            )
        ).scalar_one_or_none()
        if existing is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provided resource_id does not exist",
            )
        entry.resource_id = existing.id
    else:
        new_resource = await materialize_resource_from_submission(db, entry)
        entry.resource_id = new_resource.id


def to_response(entry: Submission) -> SubmissionResponse:
    return SubmissionResponse(
        id=entry.id,
        title=entry.title,
        type=entry.type,
        authors=entry.authors,
        year=entry.year,
        venue=entry.venue,
        discipline=entry.discipline,
        subdiscipline=entry.subdiscipline,
        keywords=entry.keywords or [],
        jel_codes=entry.jel_codes or [],
        tags=entry.tags,
        abstract=entry.abstract,
        preview=entry.preview,
        download_url=entry.download_url,
        external_url=entry.external_url,
        doi=entry.doi,
        corresponding_author_email=entry.corresponding_author_email,
        status=entry.status,
        admin_note=entry.admin_note,
        editor_note=entry.editor_note,
        resource_id=entry.resource_id,
        file_path=entry.file_path,
        submitted_by=entry.submitted_by,
        submitted_at=entry.submitted_at,
        reviewed_by=entry.reviewed_by,
        reviewed_at=entry.reviewed_at,
    )


# 参与版本快照的书目字段。故意不含 status / editor_note / resource_id ——
# 那些是工作流状态而非「作者写了什么」，把它们塞进快照会让 diff 充满
# 与稿件内容无关的噪音。
_VERSIONED_FIELDS = (
    "title",
    "type",
    "authors",
    "year",
    "venue",
    "discipline",
    "subdiscipline",
    "keywords",
    "jel_codes",
    "tags",
    "abstract",
    "preview",
    "download_url",
    "external_url",
    "doi",
    "corresponding_author_email",
)


def _version_payload(entry: Submission) -> dict[str, Any]:
    """Extract the versioned bibliographic payload from a submission."""
    return {field: getattr(entry, field) for field in _VERSIONED_FIELDS}


async def snapshot_submission(
    db: AsyncSession,
    entry: Submission,
    *,
    created_by: int | None,
    note: str | None = None,
) -> SubmissionVersion:
    """Append an immutable snapshot of ``entry`` to its version history.

    版本号取「当前最大版本 + 1」。并发重投理论上可能撞号，此时
    (submission_id, version) 唯一约束会抛 IntegrityError —— 交给调用方
    转成 409，比静默写重号安全。

    调用方负责 commit：快照必须与触发它的状态变更在同一事务里，
    否则可能出现「状态变了但没留版本」的空洞。
    """
    current_max = (
        await db.execute(
            select(func.max(SubmissionVersion.version)).where(
                SubmissionVersion.submission_id == entry.id
            )
        )
    ).scalar()
    snapshot = SubmissionVersion(
        tenant_id=entry.tenant_id,
        submission_id=entry.id,
        version=(current_max or 0) + 1,
        payload=_version_payload(entry),
        file_path=entry.file_path,
        note=note,
        created_by=created_by,
    )
    db.add(snapshot)
    return snapshot


async def list_paginated(
    db: AsyncSession,
    base_query: Any,
    page: int,
    page_size: int,
) -> SubmissionListResponse:
    """Paginate + serialize a submission query."""
    rows, meta = await paginate(
        db,
        base_query,
        page=page,
        page_size=page_size,
        order_by=(desc(Submission.submitted_at), Submission.id.asc()),
    )
    return SubmissionListResponse(
        data=[to_response(r) for r in rows],
        meta=meta,
    )


__all__ = [
    "DEFAULT_PAGE_SIZE",
    "MAX_PAGE_SIZE",
    "get_submission_or_404",
    "list_paginated",
    "materialize_resource_from_submission",
    "resolve_resource_for_approval",
    "snapshot_submission",
    "to_response",
]
