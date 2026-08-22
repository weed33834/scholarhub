"""Integration tests for admin role management endpoints.

Covers:
- GET /admin/users returns users with their roles list
- POST /admin/users/{id}/roles assigns reviewer/editor (idempotent)
- DELETE /admin/users/{id}/roles/{name} revokes role
- 404 / 400 error cases
- Non-admin cannot access (403)
"""

from __future__ import annotations

from conftest import auth_headers
from httpx import AsyncClient


async def test_list_users_includes_roles_field(
    client: AsyncClient, admin_user: dict, test_user: dict
) -> None:
    """list_users 返回的每个用户对象都含 roles: list[str] 字段。"""
    resp = await client.get("/api/admin/users", headers=auth_headers(admin_user))
    assert resp.status_code == 200
    users = resp.json()
    assert isinstance(users, list)
    assert len(users) >= 1
    for u in users:
        assert "roles" in u
        assert isinstance(u["roles"], list)


async def test_list_users_search_matches_username_and_email(
    client: AsyncClient, admin_user: dict, test_user: dict
) -> None:
    """q 参数按 username / email 子串（大小写不敏感）全表过滤。"""
    headers = auth_headers(admin_user)

    hit_by_username = await client.get(
        "/api/admin/users", params={"q": "testuser"}, headers=headers
    )
    assert hit_by_username.status_code == 200
    usernames = {u["username"] for u in hit_by_username.json()}
    assert "testuser" in usernames

    hit_by_email = await client.get(
        "/api/admin/users", params={"q": "EXAMPLE.COM"}, headers=headers
    )
    assert hit_by_email.status_code == 200
    assert any(u["username"] == "testuser" for u in hit_by_email.json())

    # LIKE 通配符必须按字面量处理："%" 不应匹配所有用户
    literal_percent = await client.get(
        "/api/admin/users", params={"q": "%%"}, headers=headers
    )
    assert literal_percent.status_code == 200
    assert all("%" not in u["email"] and "%" not in u["username"] for u in literal_percent.json())

    miss = await client.get(
        "/api/admin/users", params={"q": "no-such-user-xyz"}, headers=headers
    )
    assert miss.status_code == 200
    assert miss.json() == []


async def test_assign_reviewer_role(client: AsyncClient, admin_user: dict, test_user: dict) -> None:
    """admin 给普通用户分配 reviewer 角色；返回的 roles 列表应包含 'reviewer'。"""
    user_id = int(test_user["user_id"])
    resp = await client.post(
        f"/api/admin/users/{user_id}/roles",
        json={"role": "reviewer"},
        headers=auth_headers(admin_user),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert "reviewer" in body["roles"]


async def test_assign_role_idempotent(
    client: AsyncClient, admin_user: dict, test_user: dict
) -> None:
    """重复分配同一角色不报错（幂等），roles 列表不重复。"""
    user_id = int(test_user["user_id"])
    for _ in range(2):
        resp = await client.post(
            f"/api/admin/users/{user_id}/roles",
            json={"role": "editor"},
            headers=auth_headers(admin_user),
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["roles"].count("editor") == 1


async def test_assign_role_to_nonexistent_user_404(client: AsyncClient, admin_user: dict) -> None:
    resp = await client.post(
        "/api/admin/users/99999/roles",
        json={"role": "reviewer"},
        headers=auth_headers(admin_user),
    )
    assert resp.status_code == 404


async def test_assign_role_invalid_role_400(
    client: AsyncClient, admin_user: dict, test_user: dict
) -> None:
    """role 不在白名单中应 400。"""
    user_id = int(test_user["user_id"])
    resp = await client.post(
        f"/api/admin/users/{user_id}/roles",
        json={"role": "superuser"},  # 不允许的角色
        headers=auth_headers(admin_user),
    )
    assert resp.status_code == 422  # pydantic Literal 校验失败


async def test_revoke_role(client: AsyncClient, admin_user: dict, test_user: dict) -> None:
    """分配 + 撤销：撤销后 roles 中不应再包含该角色名。"""
    user_id = int(test_user["user_id"])
    # 先分配
    resp = await client.post(
        f"/api/admin/users/{user_id}/roles",
        json={"role": "reviewer"},
        headers=auth_headers(admin_user),
    )
    assert resp.status_code == 201
    assert "reviewer" in resp.json()["roles"]
    # 再撤销
    resp = await client.delete(
        f"/api/admin/users/{user_id}/roles/reviewer",
        headers=auth_headers(admin_user),
    )
    assert resp.status_code == 200
    assert "reviewer" not in resp.json()["roles"]


async def test_revoke_role_not_assigned_404(
    client: AsyncClient, admin_user: dict, test_user: dict
) -> None:
    """撤销未分配的角色应 404（避免静默成功）。"""
    user_id = int(test_user["user_id"])
    resp = await client.delete(
        f"/api/admin/users/{user_id}/roles/reviewer",
        headers=auth_headers(admin_user),
    )
    assert resp.status_code == 404


async def test_revoke_role_nonexistent_user_404(client: AsyncClient, admin_user: dict) -> None:
    resp = await client.delete(
        "/api/admin/users/99999/roles/reviewer",
        headers=auth_headers(admin_user),
    )
    assert resp.status_code == 404


async def test_non_admin_cannot_assign_role(client: AsyncClient, test_user: dict) -> None:
    """非 admin 用户调用应 403。"""
    user_id = int(test_user["user_id"])
    resp = await client.post(
        f"/api/admin/users/{user_id}/roles",
        json={"role": "reviewer"},
        headers=auth_headers(test_user),
    )
    assert resp.status_code == 403


async def test_non_admin_cannot_list_users(client: AsyncClient, test_user: dict) -> None:
    """非 admin 调 list_users 应 403。"""
    resp = await client.get("/api/admin/users", headers=auth_headers(test_user))
    assert resp.status_code == 403


async def test_assign_role_creates_audit_log(
    client: AsyncClient, admin_user: dict, test_user: dict
) -> None:
    """分配角色应记入审计日志（target_type=user, action=user.assign_role）。"""
    user_id = int(test_user["user_id"])
    await client.post(
        f"/api/admin/users/{user_id}/roles",
        json={"role": "reviewer"},
        headers=auth_headers(admin_user),
    )
    logs = await client.get(
        "/api/admin/audit-logs?limit=20",
        headers=auth_headers(admin_user),
    )
    assert logs.status_code == 200
    actions = [log["action"] for log in logs.json()]
    assert "user.assign_role" in actions
