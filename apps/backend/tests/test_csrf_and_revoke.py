"""Tests for D2 (refresh-revoke-all) and D3 (CSRF middleware)."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import AsyncClient

from app.core.config import settings


@pytest.mark.asyncio
async def test_revoke_all_kills_access_and_refresh(
    client: AsyncClient,
    test_user: dict[str, Any],
) -> None:
    """After /auth/revoke-all, both old access and old refresh fail."""
    access = test_user["token"]
    refresh = test_user["refresh_token"]

    # /me works.
    r = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert r.status_code == 200

    # Revoke everything.
    r2 = await client.post("/api/auth/revoke-all", headers={"Authorization": f"Bearer {access}"})
    assert r2.status_code == 204

    # Old access token is dead (token_version bumped).
    r3 = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert r3.status_code == 401

    # Old refresh token is dead (refresh_token_version bumped).
    r4 = await client.post("/api/auth/refresh", json={"refresh_token": refresh})
    assert r4.status_code == 401


@pytest.mark.asyncio
async def test_revoke_all_requires_auth(client: AsyncClient) -> None:
    r = await client.post("/api/auth/revoke-all")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# CSRF double-submit-cookie middleware
# ---------------------------------------------------------------------------


def _enable_csrf(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "csrf_enabled", True)


@pytest.mark.asyncio
async def test_csrf_disabled_by_default_allows_post(
    client: AsyncClient, test_user: dict[str, Any]
) -> None:
    """When csrf_enabled is False the middleware is a no-op even on POST."""
    assert settings.csrf_enabled is False  # baseline
    r = await client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": "password123"},
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_csrf_blocks_post_without_header(
    client: AsyncClient,
    test_user: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_csrf(monkeypatch)
    refresh = test_user["refresh_token"]

    # POST /api/auth/refresh without X-CSRF-Token + matching cookie -> 403.
    r = await client.post("/api/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 403, r.text


@pytest.mark.asyncio
async def test_csrf_allows_post_with_matching_header_and_cookie(
    client: AsyncClient,
    test_user: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_csrf(monkeypatch)
    refresh = test_user["refresh_token"]

    csrf_value = "test-csrf-token-stable-12345"
    r = await client.post(
        "/api/auth/refresh",
        json={"refresh_token": refresh},
        headers={"X-CSRF-Token": csrf_value},
        cookies={"csrf": csrf_value},
    )
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_csrf_blocks_mismatched_header(
    client: AsyncClient,
    test_user: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_csrf(monkeypatch)
    refresh = test_user["refresh_token"]

    r = await client.post(
        "/api/auth/refresh",
        json={"refresh_token": refresh},
        headers={"X-CSRF-Token": "value-B"},
        cookies={"csrf": "value-A"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_csrf_does_not_apply_to_safe_methods(
    client: AsyncClient,
    test_user: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """GET /api/auth/me must pass even with csrf_enabled on."""
    _enable_csrf(monkeypatch)
    access = test_user["token"]
    r = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_csrf_cookie_is_planted_on_safe_request(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """0.2.0 回归修复：强制模式下中间件必须在响应上种下 csrf cookie。

    此前 _ensure_csrf_cookie 定义了却从未被调用 —— 首次访问的客户端
    没有 cookie，后台 refresh 会被 403 拒绝，用户每次 access token
    过期即被登出。"""
    _enable_csrf(monkeypatch)
    r = await client.get("/api/health")
    assert r.status_code == 200
    set_cookie = r.headers.get("set-cookie", "")
    assert "csrf=" in set_cookie.lower()


@pytest.mark.asyncio
async def test_csrf_cookie_not_reissued_when_already_present(
    client: AsyncClient,
    test_user: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """请求已携带 csrf cookie 时不应重设（值保持稳定，避免并发竞态）。"""
    _enable_csrf(monkeypatch)
    access = test_user["token"]
    r = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {access}"},
        cookies={"csrf": "stable-value"},
    )
    assert r.status_code == 200
    assert "csrf=" not in r.headers.get("set-cookie", "").lower()


@pytest.mark.asyncio
async def test_csrf_rejection_response_also_plants_cookie(
    client: AsyncClient,
    test_user: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """403 拒绝响应同样种 cookie：客户端拿到值后下次重试即可带上配对头。"""
    _enable_csrf(monkeypatch)
    refresh = test_user["refresh_token"]
    r = await client.post("/api/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 403
    assert "csrf=" in r.headers.get("set-cookie", "").lower()
