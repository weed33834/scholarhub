"""Submission API routes — author submission + editor review workflow.

0.2.0 起拆分为三个文件（路径与行为与拆分前逐字一致）：

- ``author_routes.py`` — 作者侧：创建/查看/修改/版本历史/删除/重投/
  稿件上传下载
- ``editor_routes.py`` — 编辑与管理员侧：待审列表/全量列表/admin 审定/
  审稿人分配与撤销/审稿报告/四元决定
- ``services.py``      — 共享业务逻辑（快照、资源物化、序列化、分页）

本文件只做聚合：按「编辑静态路由先于作者动态路由」的顺序 include，
保证 GET /submissions/pending 不会被 GET /submissions/{id} 抢占。

Approval semantics:

- If the reviewer provides ``resource_id``, it must point to an existing
  catalog Resource in the same tenant; the submission is linked to it.
- If ``resource_id`` is omitted on approval, a new catalog Resource is
  materialized from the submission payload (the conversion logic stays
  in the catalog module).
- Once approved, the submission is terminal: status cannot be changed.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.modules.submission.author_routes import router as author_router
from app.modules.submission.editor_routes import router as editor_router

# 聚合器自身不加前缀：两个子路由已各自携带 /submissions。
router = APIRouter()

# 顺序重要：编辑侧的静态路径（/pending 等）必须先于作者侧的
# /{submission_id} 注册，避免字面量被动态段吞掉。
router.include_router(editor_router)
router.include_router(author_router)
