"""Submission API routes — author submission + editor review workflow.

Author side (auth, every user sees their own submissions only):
  POST   /submissions                     — submit a record for review
  GET    /submissions/me                  — list my submissions (filter by status)
  GET    /submissions/{id}                — view one (owner or admin only)

Editor side (admin only):
  GET    /submissions                     — list all submissions in the tenant
  GET    /submissions/pending             — list pending submissions only
  PATCH  /submissions/{id}/review         — approve / reject + (optional)
                                              link to existing catalog Resource
                                              OR materialize a new one from
                                              the submission payload.

Approval semantics:

- If the reviewer provides ``resource_id``, it must point to an existing
  catalog Resource in the same tenant; the submission is linked to it.
- If ``resource_id`` is omitted on approval, a new catalog Resource is
  materialized from the submission payload via the catalog admin POST
  endpoint (the conversion logic stays in the catalog module).
- Once approved, the submission is terminal: status cannot be changed.
"""

from __future__ import annotations

from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import (
    get_current_user,
    require_admin,
    require_editor,
    require_tenant_id,
)
from app.core import search as fulltext
from app.core.db import get_db, paginate
from app.core.time import utcnow
from app.models import AuditLog, Role, User, UserRole
from app.modules.catalog.models import Resource
from app.modules.catalog.schemas import ResourceCreate
from app.modules.notifications import services as notifications
from app.modules.review.models import ReviewAssignment, ReviewReport
from app.modules.review.schemas import (
    AssignmentCreate,
    AssignmentListResponse,
    AssignmentResponse,
    ReviewReportResponse,
)
from app.modules.submission.models import Submission, SubmissionVersion
from app.modules.submission.schemas import (
    MessageResponse,
    ResubmitRequest,
    SubmissionCreate,
    SubmissionDecision,
    SubmissionListResponse,
    SubmissionResponse,
    SubmissionReview,
    SubmissionUpdate,
    SubmissionVersionListResponse,
    SubmissionVersionResponse,
)

router = APIRouter(prefix="/submissions", tags=["submissions"])

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


async def _get_or_404(
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


async def _materialize_resource_from_submission(
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
        # 修复：物化时把 submission 的 keywords 带过去
        keywords=submission.keywords or None,
    )
    db.add(resource)
    await db.flush()
    # 同步全文索引（best-effort）。即使后续事务回滚产生幽灵文档也无害：
    # 搜索路由按 id 回读 DB，查不到的命中会被静默丢弃。
    await fulltext.index_resource(resource)
    return resource


def _to_response(entry: Submission) -> SubmissionResponse:
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


async def _snapshot_submission(
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


async def _list_submissions(
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
        data=[_to_response(r) for r in rows],
        meta=meta,
    )


# ---------------------------------------------------------------------------
# Author side
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=SubmissionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_submission(
    body: SubmissionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubmissionResponse:
    """Submit a record for editor review (auth required)."""
    submission = Submission(
        tenant_id=current_user.tenant_id,
        submitted_by=current_user.id,
        status="pending",
        title=body.title,
        type=body.type,
        authors=body.authors,
        year=body.year,
        venue=body.venue,
        discipline=body.discipline,
        subdiscipline=body.subdiscipline,
        keywords=body.keywords,
        jel_codes=body.jel_codes,
        tags=body.tags,
        abstract=body.abstract,
        preview=body.preview,
        download_url=body.download_url,
        external_url=body.external_url,
        doi=body.doi,
        corresponding_author_email=body.corresponding_author_email,
    )
    db.add(submission)
    await db.flush()  # 拿到 submission.id 供 v1 快照引用
    # v1 快照：保证「最初提交了什么」永远可查（版本历史从创建开始）
    await _snapshot_submission(db, submission, created_by=current_user.id)
    await db.commit()
    await db.refresh(submission)
    return _to_response(submission)


@router.get("/me", response_model=SubmissionListResponse)
async def list_my_submissions(
    status_filter: str = Query(
        default=None,
        alias="status",
        pattern=r"^(pending|under_review|major_revision|minor_revision|resubmitted|accepted|approved|rejected)$",
    ),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubmissionListResponse:
    """List the current user's own submissions."""
    query = select(Submission).where(
        Submission.submitted_by == current_user.id,
        Submission.tenant_id == current_user.tenant_id,
    )
    if status_filter is not None:
        query = query.where(Submission.status == status_filter)
    return await _list_submissions(db, query, page, page_size)


@router.get("/pending", response_model=SubmissionListResponse)
async def list_pending_submissions(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> SubmissionListResponse:
    """List pending submissions awaiting review (editor+).

    包含 pending（待分配审稿人）与 under_review（已分配审稿人但未出决定）。
    """
    tenant_id = require_tenant_id()
    query = (
        select(Submission)
        .where(
            Submission.status.in_(("pending", "under_review")),
            Submission.tenant_id == tenant_id,
        )
    )
    return await _list_submissions(db, query, page, page_size)


@router.get("", response_model=SubmissionListResponse)
async def list_submissions(
    status_filter: str = Query(
        default=None,
        alias="status",
        pattern=r"^(pending|under_review|major_revision|minor_revision|resubmitted|accepted|approved|rejected)$",
    ),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> SubmissionListResponse:
    """List all submissions in the tenant (editor+)."""
    tenant_id = require_tenant_id()
    query = select(Submission).where(Submission.tenant_id == tenant_id)
    if status_filter is not None:
        query = query.where(Submission.status == status_filter)
    return await _list_submissions(db, query, page, page_size)


@router.get("/{submission_id}", response_model=SubmissionResponse)
async def get_submission(
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubmissionResponse:
    """View a submission. Owner sees their own; admin sees any."""
    entry = await _get_or_404(db, submission_id)
    if entry.submitted_by != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )
    return _to_response(entry)


@router.patch("/{submission_id}", response_model=SubmissionResponse)
async def update_submission(
    submission_id: int,
    body: SubmissionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubmissionResponse:
    """作者修改自己的稿件内容（补齐修回链路的缺口）。

    此前 major/minor revision 后作者只能翻状态「重投」，却改不了
    任何内容 —— 修回等于空转。此端点让作者在以下状态可编辑：

    - ``pending``：还没进入评审，随便改；
    - ``major_revision`` / ``minor_revision``：按审稿意见修改，
      改完再点重投（重投时快照为新版本）。

    under_review 不可编辑：审稿人正在看的稿子不能被作者悄悄换掉。
    终态（accepted/rejected/approved）不可编辑。
    """
    entry = await _get_or_404(db, submission_id)
    if entry.submitted_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the submitter can edit the submission",
        )
    if entry.status not in ("pending", "major_revision", "minor_revision"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot edit submission in status '{entry.status}'",
        )
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return _to_response(entry)
    for field, value in updates.items():
        # AnyHttpUrl 落库前转 str，与 create 端点行为一致
        if field in ("download_url", "external_url") and value is not None:
            value = str(value)
        setattr(entry, field, value)
    await db.commit()
    await db.refresh(entry)
    return _to_response(entry)


@router.get(
    "/{submission_id}/versions",
    response_model=SubmissionVersionListResponse,
)
async def list_submission_versions(
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubmissionVersionListResponse:
    """稿件版本历史（v1 = 初次提交；之后每次重投一个版本）。

    可见方：作者本人、admin/editor。审稿人故意不给 —— 双盲模式下
    历史版本可能残留身份信息，且审稿人只需要看「当前版本」。
    """
    from app.api.deps import ROLE_EDITOR, user_has_role

    entry = await _get_or_404(db, submission_id)
    allowed = (
        entry.submitted_by == current_user.id
        or current_user.is_admin
        or await user_has_role(db, current_user, ROLE_EDITOR)
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )
    rows = (
        (
            await db.execute(
                select(SubmissionVersion)
                .where(SubmissionVersion.submission_id == entry.id)
                .order_by(SubmissionVersion.version.desc())
            )
        )
        .scalars()
        .all()
    )
    return SubmissionVersionListResponse(
        data=[SubmissionVersionResponse.model_validate(v) for v in rows]
    )


# ---------------------------------------------------------------------------
# Editor review
# ---------------------------------------------------------------------------


@router.patch(
    "/{submission_id}/review",
    response_model=SubmissionResponse,
)
async def review_submission(
    submission_id: int,
    body: SubmissionReview,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> SubmissionResponse:
    """Approve or reject a pending submission (admin only).

    Terminal: once reviewed, a submission cannot be re-reviewed.
    """
    entry = await _get_or_404(db, submission_id)
    if entry.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission has already been reviewed",
        )

    now = utcnow()
    entry.status = body.status
    entry.admin_note = body.admin_note
    entry.reviewed_by = current_user.id
    entry.reviewed_at = now

    if body.status == "approved":
        if body.resource_id is not None:
            # Link to existing catalog Resource — must exist in this tenant.
            existing = (
                await db.execute(
                    select(Resource).where(
                        Resource.id == body.resource_id,
                        Resource.tenant_id == current_user.tenant_id,
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
            # Materialize a new catalog Resource from the submission payload.
            # The conversion stays here (orchestration); catalog owns the
            # Resource shape — we just construct it via the same fields the
            # catalog admin POST would accept.
            _ = ResourceCreate(
                type=entry.type,
                title=entry.title,
                authors=entry.authors,
                year=entry.year,
                venue=entry.venue,
                discipline=entry.discipline,
                subdiscipline=entry.subdiscipline,
                tags=entry.tags,
                abstract=entry.abstract,
                preview=entry.preview,
                download_url=entry.download_url,
                external_url=entry.external_url,
                doi=entry.doi,
            )
            new_resource = await _materialize_resource_from_submission(db, entry)
            entry.resource_id = new_resource.id

    # Audit: reviewer's approve/reject decision is a destructive state
    # transition (terminal). Log actor + outcome so the trail survives
    # even if the submission row is later purged. The audit row joins the
    # SAME transaction as the status change — a crash can never produce a
    # recorded decision without its audit record.
    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            actor_user_id=current_user.id,
            action="submission.review",
            target_type="submission",
            target_id=str(entry.id),
            payload={
                "status": body.status,
                "resource_id": entry.resource_id,
                "admin_note_present": bool(body.admin_note),
            },
        )
    )
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Submission could not be reviewed (concurrent update)",
        ) from exc
    await db.refresh(entry)
    return _to_response(entry)


@router.delete(
    "/{submission_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
)
async def delete_submission(
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Delete a submission. Submitter may delete their own pending only.

    Approved/rejected submissions are immutable historical records and
    cannot be deleted by the submitter (admin can via direct DB access
    if needed; not exposed via API to keep the audit trail intact).
    """
    entry = await _get_or_404(db, submission_id)
    if entry.submitted_by != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )
    if entry.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete a reviewed submission",
        )
    await db.delete(entry)
    await db.commit()
    return MessageResponse(message="Submission deleted")


# ---------------------------------------------------------------------------
# Editor: assign reviewer + list assignments + 4 元 decision + list reports
# ---------------------------------------------------------------------------


@router.post(
    "/{submission_id}/assignments",
    response_model=AssignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def assign_reviewer(
    submission_id: int,
    body: AssignmentCreate,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> AssignmentResponse:
    """编辑分配审稿人。submission 必须处于 pending / under_review / resubmitted。

    分配后 submission 自动从 pending → under_review（仅 pending 时）。
    """
    entry = await _get_or_404(db, submission_id)
    if entry.status not in ("pending", "under_review", "resubmitted"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot assign reviewer in status '{entry.status}'",
        )
    # 审稿人必须存在且属于当前租户
    reviewer = (
        await db.execute(
            select(User).where(
                User.id == body.reviewer_id,
                User.tenant_id == entry.tenant_id,
                User.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if reviewer is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reviewer not found or inactive",
        )
    assignment = ReviewAssignment(
        tenant_id=entry.tenant_id,
        submission_id=entry.id,
        reviewer_id=reviewer.id,
        assigned_by=current_user.id,
        status="pending",
        due_date=body.due_date,
    )
    db.add(assignment)
    if entry.status == "pending":
        entry.status = "under_review"
    try:
        # Flush inside the try: a duplicate-assignment IntegrityError must
        # still surface as 409. The audit row joins the SAME transaction as
        # the assignment — no window where an assignment exists unlogged.
        await db.flush()
        db.add(
            AuditLog(
                tenant_id=current_user.tenant_id,
                actor_user_id=current_user.id,
                action="submission.assign_reviewer",
                target_type="submission",
                target_id=str(entry.id),
                payload={
                    "reviewer_id": reviewer.id,
                    "assignment_id": assignment.id,
                },
            )
        )
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Reviewer already assigned or concurrent update",
        ) from exc
    await db.refresh(assignment)
    # Notify reviewers
    await notifications.create(
        db,
        tenant_id=entry.tenant_id,
        user_id=reviewer.id,
        type_="review.invited",
        title=f"You have been invited to review: {entry.title}",
        body=f"Submission #{entry.id} has been assigned to you, please respond at the review workspace.",
        related_type="review_assignment",
        related_id=str(assignment.id),
    )
    await db.commit()
    return AssignmentResponse(
        id=assignment.id,
        submission_id=assignment.submission_id,
        reviewer_id=assignment.reviewer_id,
        assigned_by=assignment.assigned_by,
        status=assignment.status,
        due_date=assignment.due_date,
        invited_at=assignment.invited_at,
        responded_at=assignment.responded_at,
        completed_at=assignment.completed_at,
        reviewer_username=reviewer.username,
        submission_title=entry.title,
    )


@router.get(
    "/{submission_id}/assignments",
    response_model=AssignmentListResponse,
)
async def list_assignments(
    submission_id: int,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> AssignmentListResponse:
    """列出 submission 的所有审稿分配（编辑视角，含审稿人身份）。"""
    entry = await _get_or_404(db, submission_id)
    rows = (
        await db.execute(
            select(ReviewAssignment)
            .where(
                ReviewAssignment.submission_id == entry.id,
                ReviewAssignment.tenant_id == entry.tenant_id,
            )
            .options(
                selectinload(ReviewAssignment.reviewer),
                selectinload(ReviewAssignment.submission),
            )
            .order_by(ReviewAssignment.invited_at.desc())
        )
    ).scalars().all()
    from app.core.schemas import PaginationMeta

    total = len(rows)
    page_size = total or 1
    return AssignmentListResponse(
        data=[
            AssignmentResponse(
                id=a.id,
                submission_id=a.submission_id,
                reviewer_id=a.reviewer_id,
                assigned_by=a.assigned_by,
                status=a.status,
                due_date=a.due_date,
                invited_at=a.invited_at,
                responded_at=a.responded_at,
                completed_at=a.completed_at,
                reviewer_username=a.reviewer.username if a.reviewer else None,
                submission_title=entry.title,
            )
            for a in rows
        ],
        meta=PaginationMeta(
            total=total, page=1, page_size=page_size, total_pages=1
        ),
    )


@router.delete(
    "/{submission_id}/assignments/{assignment_id}",
    response_model=MessageResponse,
)
async def cancel_assignment(
    submission_id: int,
    assignment_id: int,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """编辑撤销审稿人邀请。已 completed 的不可撤销（保留审稿历史）。"""
    entry = await _get_or_404(db, submission_id)
    a = (
        await db.execute(
            select(ReviewAssignment).where(
                ReviewAssignment.id == assignment_id,
                ReviewAssignment.submission_id == entry.id,
                ReviewAssignment.tenant_id == entry.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if a is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )
    if a.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot cancel a completed assignment (review report exists)",
        )
    a.status = "cancelled"
    # Audit rides in the same transaction as the cancellation itself.
    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            actor_user_id=current_user.id,
            action="submission.cancel_reviewer",
            target_type="submission",
            target_id=str(entry.id),
            payload={"assignment_id": a.id, "reviewer_id": a.reviewer_id},
        )
    )
    await db.commit()
    return MessageResponse(message="Assignment cancelled")


@router.get(
    "/{submission_id}/reports",
    response_model=list[ReviewReportResponse],
)
async def list_review_reports(
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ReviewReportResponse]:
    """列出 submission 的所有审稿报告。

    - 编辑（admin/editor）：看完整报告（含 editor-only comments）
    - 作者：只看 comments_to_author（单盲：不暴露审稿人身份）
    - 审稿人自己：看自己的报告
    """
    entry = await _get_or_404(db, submission_id)
    # 单盲：编辑（admin 或有 editor 角色）看完整报告；
    # 作者只看 comments_to_author；其他人无权限
    from app.api.deps import ROLE_EDITOR, _user_has_role

    is_editor = current_user.is_admin or await _user_has_role(
        db, current_user, ROLE_EDITOR
    )
    is_author = entry.submitted_by == current_user.id
    if not is_editor and not is_author:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    rows = (
        await db.execute(
            select(ReviewReport)
            .join(ReviewAssignment, ReviewReport.assignment_id == ReviewAssignment.id)
            .where(
                ReviewAssignment.submission_id == entry.id,
                ReviewReport.tenant_id == entry.tenant_id,
                ReviewAssignment.status == "completed",
            )
        )
    ).scalars().all()

    out: list[ReviewReportResponse] = []
    for r in rows:
        # 作者：剥离 editor-only comments
        if is_author and not is_editor:
            out.append(
                ReviewReportResponse(
                    id=r.id,
                    assignment_id=r.assignment_id,
                    recommendation=r.recommendation,
                    scores=r.scores,
                    comments_to_editor=None,
                    comments_to_author=r.comments_to_author,
                    submitted_at=r.submitted_at,
                )
            )
        else:
            out.append(
                ReviewReportResponse(
                    id=r.id,
                    assignment_id=r.assignment_id,
                    recommendation=r.recommendation,
                    scores=r.scores,
                    comments_to_editor=r.comments_to_editor,
                    comments_to_author=r.comments_to_author,
                    submitted_at=r.submitted_at,
                )
            )
    return out


@router.patch(
    "/{submission_id}/decision",
    response_model=SubmissionResponse,
)
async def editor_decision(
    submission_id: int,
    body: SubmissionDecision,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> SubmissionResponse:
    """编辑最终决定（4 元）。

    accept: 自动物化 catalog Resource（除非 resource_id 指定现有资源），
            submission.status = 'accepted'
    minor_revision / major_revision: status = 对应值，等作者 resubmit
    reject: status = 'rejected'（终态）

    approved / rejected 是旧 review 端点的别名，等价于 accept / reject。
    """
    entry = await _get_or_404(db, submission_id)
    # 仅 pending / under_review / resubmitted 可决断
    if entry.status not in ("pending", "under_review", "resubmitted"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot decide in status '{entry.status}'",
        )

    decision = body.decision
    # 旧别名归一化
    if decision == "approved":
        decision = "accept"
    elif decision == "rejected":
        decision = "reject"

    now = utcnow()
    entry.editor_note = body.editor_note
    entry.reviewed_by = current_user.id
    entry.reviewed_at = now

    if decision == "accept":
        if body.resource_id is not None:
            existing = (
                await db.execute(
                    select(Resource).where(
                        Resource.id == body.resource_id,
                        Resource.tenant_id == entry.tenant_id,
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
            _ = ResourceCreate(
                type=entry.type,
                title=entry.title,
                authors=entry.authors,
                year=entry.year,
                venue=entry.venue,
                discipline=entry.discipline,
                subdiscipline=entry.subdiscipline,
                tags=entry.tags,
                abstract=entry.abstract,
                preview=entry.preview,
                download_url=entry.download_url,
                external_url=entry.external_url,
                doi=entry.doi,
            )
            new_resource = await _materialize_resource_from_submission(db, entry)
            entry.resource_id = new_resource.id
        entry.status = "accepted"
    elif decision in ("major_revision", "minor_revision"):
        entry.status = decision
    elif decision == "reject":
        entry.status = "rejected"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown decision: {decision}",
        )

    # Audit joins the SAME transaction as the decision itself — the trail
    # can never lag behind (or miss) a recorded accept/reject/revision.
    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            actor_user_id=current_user.id,
            action="submission.decision",
            target_type="submission",
            target_id=str(entry.id),
            payload={
                "decision": decision,
                "resource_id": entry.resource_id,
                "editor_note_present": bool(body.editor_note),
            },
        )
    )
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not apply decision (concurrent update)",
        ) from exc
    await db.refresh(entry)

    # 通知作者。录用时 related 指向物化出的公开目录条目而非 submission，
    # 作者点通知即可直达自己已发表的文章（目录详情页对访客也公开）。
    decision_labels = {
        "accept": "录用",
        "reject": "拒稿",
        "minor_revision": "小修",
        "major_revision": "大修",
    }
    accepted = decision == "accept" and entry.resource_id is not None
    await notifications.create(
        db,
        tenant_id=entry.tenant_id,
        user_id=entry.submitted_by,
        type_="submission.decision",
        title=f"稿件决定通知：{entry.title}",
        body=(
            f"您的稿件 #{entry.id} 收到编辑决定：{decision_labels.get(decision, decision)}。"
            + (f" 编辑备注：{body.editor_note}" if body.editor_note else "")
            + ("（文章已收录进公开目录，点击查看发表页面）" if accepted else "")
        ),
        related_type="resource" if accepted else "submission",
        related_id=str(entry.resource_id) if accepted else str(entry.id),
    )
    await db.commit()
    return _to_response(entry)


@router.post(
    "/{submission_id}/resubmit",
    response_model=SubmissionResponse,
)
async def author_resubmit(
    submission_id: int,
    body: ResubmitRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubmissionResponse:
    """作者收到 major_revision / minor_revision 后重新提交。

    将状态置为 under_review（编辑可再次分配/决断），并把当前（作者已
    通过 PATCH 修改过的）稿件内容快照为新版本。可选 ``note`` 记录
    「针对审稿意见做了哪些修改」，随版本一起存档并推送给编辑。

    仅作者本人可操作。body 可省略，兼容旧的无 body 调用。
    """
    entry = await _get_or_404(db, submission_id)
    if entry.submitted_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the submitter can resubmit",
        )
    if entry.status not in ("major_revision", "minor_revision"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot resubmit in status '{entry.status}'",
        )
    note = body.note if body else None
    entry.status = "under_review"
    # 快照与状态变更同事务：避免「状态翻了但没留版本」的历史空洞
    snapshot = await _snapshot_submission(db, entry, created_by=current_user.id, note=note)
    # commit 后 ORM 对象过期，异步会话下惰性刷新会炸；版本号在 commit 前取出
    version_no = snapshot.version
    try:
        await db.commit()
    except IntegrityError as exc:
        # (submission_id, version) 唯一约束冲突 = 并发重投撞号
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Concurrent resubmit detected, please retry",
        ) from exc
    await db.refresh(entry)
    # 通知编辑：作者已重投。
    # admin 在权限模型里视同 editor（deps._user_has_role 对 admin 直接放行），
    # fan-out 必须与之对齐 —— 否则只有 admin 的小刊重投通知会石沉大海。
    editor_ids = select(UserRole.user_id).join(
        Role, Role.id == UserRole.role_id
    ).where(
        UserRole.tenant_id == entry.tenant_id,
        Role.tenant_id == entry.tenant_id,
        Role.name == "editor",
    )
    editors = (
        await db.execute(
            select(User)
            .where(
                User.tenant_id == entry.tenant_id,
                User.is_active.is_(True),
                (User.id.in_(editor_ids)) | (User.is_admin.is_(True)),
            )
            .distinct()
        )
    ).scalars().all()
    notify_body = f"Submission #{entry.id}（v{version_no}）已进入 under_review，请处理。"
    if note:
        notify_body += f"\n作者修改说明：{note}"
    for editor in editors:
        await notifications.create(
            db,
            tenant_id=entry.tenant_id,
            user_id=editor.id,
            type_="submission.resubmitted",
            title=f"作者已重新提交：{entry.title}",
            body=notify_body,
            related_type="submission",
            related_id=str(entry.id),
        )
    await db.commit()
    return _to_response(entry)


# ---------------------------------------------------------------------------
# File upload (作者投稿时上传 PDF)
# ---------------------------------------------------------------------------


_ALLOWED_UPLOAD_MIMES = frozenset(
    {
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/postscript",
        "text/plain",
        "application/zip",
    }
)
_MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB


@router.post(
    "/{submission_id}/files",
    response_model=SubmissionResponse,
)
async def upload_submission_file(
    submission_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubmissionResponse:
    """作者上传稿件 PDF（替换式：重复上传会覆盖 file_path）。

    限制：
    - 仅作者本人
    - submission 必须处于 pending / under_review / major_revision / minor_revision
      （under_review 允许是为了让编辑要求作者替换稿件时仍能上传）
    - accepted / rejected 终态下不可上传
    - MIME 必须在白名单内
    - 大小 ≤ 50 MB
    - 文件名经过 path 安全检查（防 ../ 穿越）
    """
    import os
    from uuid import uuid4

    from app.core.storage import get_storage

    entry = await _get_or_404(db, submission_id)
    if entry.submitted_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the submitter can upload files",
        )
    if entry.status not in (
        "pending",
        "under_review",
        "major_revision",
        "minor_revision",
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot upload files in status '{entry.status}'",
        )
    if file.content_type not in _ALLOWED_UPLOAD_MIMES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {file.content_type}",
        )

    # 流式读 + 大小校验，避免一次性 OOM
    contents = b""
    while True:
        chunk = await file.read(64 * 1024)
        if not chunk:
            break
        contents += chunk
        if len(contents) > _MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File exceeds {_MAX_UPLOAD_BYTES} bytes",
            )

    # 存储 key：{tenant_id}/{submission_id}/{uuid}{ext}
    # 用 uuid 防文件名碰撞 + 路径穿越；本地/S3 后端共用同一 key 形状，
    # 切换后端无需迁移数据库。
    original_filename = file.filename or "upload"
    ext = os.path.splitext(original_filename)[1]
    if ext and len(ext) > 20:
        ext = ext[:20]
    safe_name = f"{uuid4().hex}{ext}"
    rel_path = f"{entry.tenant_id}/{entry.id}/{safe_name}"
    await get_storage().save(rel_path, contents, content_type=file.content_type)
    entry.file_path = rel_path
    await db.commit()
    await db.refresh(entry)
    return _to_response(entry)


@router.get("/{submission_id}/files")
async def download_submission_file(
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """下载稿件文件。

    这里补上了此前缺失的链路终点：稿件此前只能上传、无法取回，
    编辑与被指派的审稿人拿不到作者的 PDF，评审无从谈起。

    可访问方：
    - 作者本人
    - admin / editor
    - 该稿件的被指派审稿人（assignment 处于 pending/accepted/completed）

    S3 后端会尽量返回 302 预签名直链（省一次服务端带宽）；本地后端
    与预签名失败时改为服务端流式返回，权限校验始终发生在这里。
    """
    import mimetypes

    from fastapi.responses import RedirectResponse, StreamingResponse

    from app.api.deps import ROLE_EDITOR, user_has_role
    from app.core.storage import get_storage

    entry = await _get_or_404(db, submission_id)
    if not entry.file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This submission has no uploaded file",
        )

    allowed = entry.submitted_by == current_user.id or await user_has_role(
        db, current_user, ROLE_EDITOR
    )
    if not allowed:
        assignment = (
            await db.execute(
                select(ReviewAssignment).where(
                    ReviewAssignment.submission_id == entry.id,
                    ReviewAssignment.reviewer_id == current_user.id,
                    ReviewAssignment.status.in_(("pending", "accepted", "completed")),
                )
            )
        ).scalars().first()
        allowed = assignment is not None
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this submission file",
        )

    storage = get_storage()
    url = storage.presigned_url(entry.file_path)
    if url:
        return RedirectResponse(url, status_code=status.HTTP_302_FOUND)

    try:
        data = await storage.load(entry.file_path)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stored file is missing",
        ) from exc

    filename = entry.file_path.rsplit("/", 1)[-1]
    media_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    return StreamingResponse(
        iter((data,)),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
