"""Author-side submission endpoints.

拆分自原单体 routes.py（0.2.0）：本文件只保留「作者侧」九个端点，
共享业务逻辑一律走 ``services`` 层；编辑侧见 ``editor_routes.py``。
路径、方法、状态码与响应模型与拆分前逐字一致。
"""

from __future__ import annotations

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
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import Role, User, UserRole
from app.modules.notifications import services as notifications
from app.modules.submission.models import SubmissionVersion
from app.modules.submission.schemas import (
    MessageResponse,
    ResubmitRequest,
    SubmissionCreate,
    SubmissionListResponse,
    SubmissionResponse,
    SubmissionUpdate,
    SubmissionVersionListResponse,
    SubmissionVersionResponse,
)
from app.modules.submission.services import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    get_submission_or_404,
    list_paginated,
    snapshot_submission,
    to_response,
)

router = APIRouter(prefix="/submissions", tags=["submissions"])


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
    from app.modules.submission.models import Submission

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
    await snapshot_submission(db, submission, created_by=current_user.id)
    await db.commit()
    await db.refresh(submission)
    return to_response(submission)


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
    from app.modules.submission.models import Submission

    query = select(Submission).where(
        Submission.submitted_by == current_user.id,
        Submission.tenant_id == current_user.tenant_id,
    )
    if status_filter is not None:
        query = query.where(Submission.status == status_filter)
    return await list_paginated(db, query, page, page_size)


@router.get("/{submission_id}", response_model=SubmissionResponse)
async def get_submission(
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubmissionResponse:
    """View a submission. Owner sees their own; admin sees any."""
    entry = await get_submission_or_404(db, submission_id)
    if entry.submitted_by != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )
    return to_response(entry)


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
    entry = await get_submission_or_404(db, submission_id)
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
        return to_response(entry)
    for field, value in updates.items():
        # AnyHttpUrl 落库前转 str，与 create 端点行为一致
        if field in ("download_url", "external_url") and value is not None:
            value = str(value)
        setattr(entry, field, value)
    await db.commit()
    await db.refresh(entry)
    return to_response(entry)


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

    entry = await get_submission_or_404(db, submission_id)
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
    entry = await get_submission_or_404(db, submission_id)
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
    entry = await get_submission_or_404(db, submission_id)
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
    snapshot = await snapshot_submission(
        db, entry, created_by=current_user.id, note=note
    )
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
    return to_response(entry)


# ---------------------------------------------------------------------------
# File upload / download (作者投稿时上传 PDF，编辑/审稿人取回)
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
    - MIME 必须在白名单内，且内容魔数与声明类型一致（防伪装上传）
    - 大小 ≤ 50 MB
    - 文件名经过 path 安全检查（防 ../ 穿越）
    """
    import os
    import tempfile
    from uuid import uuid4

    from app.core.filescan import SNIFF_LEN, content_matches_declared
    from app.core.storage import get_storage

    entry = await get_submission_or_404(db, submission_id)
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

    # 流式写入磁盘回退的内存临时文件：8 MB 以内驻留内存，超出自动落盘，
    # 内存占用有界（此前是 contents += chunk 全量攒在 RAM）。
    spool = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024)
    try:
        total = 0
        while True:
            chunk = await file.read(256 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > _MAX_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds {_MAX_UPLOAD_BYTES} bytes",
                )
            spool.write(chunk)

        # 内容嗅探：声明的 MIME 必须与文件头真实格式一致，否则拒绝。
        # （Content-Type 由客户端自报，不可信。）
        spool.seek(0)
        head = spool.read(SNIFF_LEN)
        if not content_matches_declared(head, file.content_type):
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=(
                    "File content does not match its declared type "
                    f"({file.content_type}); supported: PDF, DOCX/ZIP, "
                    "DOC, PostScript, plain text"
                ),
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
        spool.seek(0)
        await get_storage().save(rel_path, spool, content_type=file.content_type)
    finally:
        spool.close()
    entry.file_path = rel_path
    await db.commit()
    await db.refresh(entry)
    return to_response(entry)


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

    from fastapi.responses import (
        FileResponse,
        RedirectResponse,
        StreamingResponse,
    )

    from app.api.deps import ROLE_EDITOR, user_has_role
    from app.core.storage import LocalStorage, get_storage
    from app.modules.review.models import ReviewAssignment

    entry = await get_submission_or_404(db, submission_id)
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

    filename = entry.file_path.rsplit("/", 1)[-1]
    media_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"

    # 本地后端：FileResponse 按块流式发送（支持 Range/ETag），不再把整个
    # 文件读进内存。其余后端保持服务端缓冲回退。
    if isinstance(storage, LocalStorage):
        path = storage.abs_path(entry.file_path)
        if not path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Stored file is missing",
            )
        return FileResponse(
            path,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    try:
        data = await storage.load(entry.file_path)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stored file is missing",
        ) from exc

    return StreamingResponse(
        iter((data,)),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
