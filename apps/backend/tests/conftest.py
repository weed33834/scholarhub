"""Pytest fixtures for the base spine tests.

Strategy:
- SQLite in-memory + StaticPool: all sessions share one connection so
  CREATE TABLE in one session is visible to others.
- Replace ``app.core.db.engine`` and ``async_session_factory`` with the
  test versions so the TenantContextMiddleware (which imports the
  factory lazily) also uses the test engine.
- Override ``get_db`` dependency with the test session factory.
- Trigger FastAPI lifespan via ``asgi-lifespan`` so ``load_all()`` runs.
- Reset ``TenantContextMiddleware._single_mode_tenant_id`` between
  tests so the bootstrap tenant is re-created against the fresh table.
"""

from __future__ import annotations

import os
import tempfile
from collections.abc import AsyncGenerator

# Must run before any `app.*` import so Settings() reads test env.
# The default ``SCHOLARHUB_STORAGE_PATH`` is ``/data/uploads`` (a production
# mount point with no write permission on CI). Routing real file uploads at
# that host path makes every storage-backed test fail with
# ``PermissionError: '/data'`` on hosted runners. Point storage at a
# per-process temp dir so upload/download tests never depend on the host
# filesystem layout. Created here (not via a fixture) so the env var is set
# before ``Settings()`` is instantiated during ``app.*`` import.
os.environ.setdefault(
    "SCHOLARHUB_STORAGE_PATH",
    tempfile.mkdtemp(prefix="scholarhub-test-storage-"),
)
os.environ.setdefault("SCHOLARHUB_ENVIRONMENT", "test")
os.environ.setdefault("SCHOLARHUB_DATABASE_URL", "sqlite+aiosqlite:///:memory:")

import pytest_asyncio
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from app.core import db as db_module
from app.core.db import get_db
from app.core.tenant import TenantContextMiddleware
from app.main import app
from app.models import Base

# All sessions share one underlying connection so the schema created in
# `fresh_database` is visible to every session opened afterwards.
test_engine = create_async_engine(
    "sqlite+aiosqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
test_async_session_factory = async_sessionmaker(
    test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Replace the production engine + factory so middleware (which lazily
# imports ``async_session_factory``) also targets the in-memory DB.
db_module.engine = test_engine
db_module.async_session_factory = test_async_session_factory


async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with test_async_session_factory() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db


def _reset_tenant_middleware_cache() -> None:
    """Reset ``TenantContextMiddleware._single_mode_tenant_id`` so the
    next request re-creates the bootstrap tenant against the fresh table.
    """
    current = app.middleware_stack
    while current is not None:
        if isinstance(current, TenantContextMiddleware):
            current._single_mode_tenant_id = None  # type: ignore[attr-defined]
            return
        current = getattr(current, "app", None)


@pytest_asyncio.fixture(autouse=True)
async def fresh_database() -> AsyncGenerator[None, None]:
    """Drop + recreate tables for every test to guarantee isolation.

    ``Base.metadata`` is the shared core metadata; importing catalog
    models at app import time registered ``resources`` + ``resource_stats``
    on the same metadata, so a single create_all covers both.
    """
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with test_async_session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """ASGI client with lifespan started (so ``load_all()`` runs)."""
    async with LifespanManager(app) as manager:
        _reset_tenant_middleware_cache()
        async with AsyncClient(
            transport=ASGITransport(app=manager.app),
            base_url="http://test",
        ) as ac:
            yield ac


@pytest_asyncio.fixture
async def test_user(client: AsyncClient) -> dict[str, str | int | bool]:
    """Register a normal user via the API and return login credentials."""
    response = await client.post(
        "/api/auth/register",
        json={
            "email": "user@example.com",
            "username": "testuser",
            "password": "password123",
        },
    )
    response.raise_for_status()
    data = response.json()
    return {
        "email": "user@example.com",
        "username": "testuser",
        "password": "password123",
        "token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "user_id": data["user_id"],
        "is_admin": data["is_admin"],
    }


@pytest_asyncio.fixture
async def admin_user(client: AsyncClient, db_session: AsyncSession) -> dict[str, str | int | bool]:
    """Create an admin user directly in the DB and login via the API."""
    from sqlalchemy import select

    from app.core.security import hash_password
    from app.models import Tenant, User

    # Trigger middleware to create the bootstrap tenant. admin_user
    # does not depend on test_user, so we must warm the tenant cache
    # ourselves with any request.
    warmup = await client.get("/api/health")
    warmup.raise_for_status()

    result = await db_session.execute(select(Tenant).where(Tenant.slug == "default"))
    tenant = result.scalar_one()
    db_session.add(
        User(
            tenant_id=tenant.id,
            email="admin@example.com",
            username="adminuser",
            hashed_password=hash_password("adminpass123"),
            is_active=True,
            is_admin=True,
        )
    )
    await db_session.commit()

    response = await client.post(
        "/api/auth/login",
        json={"username": "adminuser", "password": "adminpass123"},
    )
    response.raise_for_status()
    data = response.json()
    return {
        "email": "admin@example.com",
        "username": "adminuser",
        "password": "adminpass123",
        "token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "user_id": data["user_id"],
        "is_admin": data["is_admin"],
    }


def auth_headers(user: dict[str, str | int | bool]) -> dict[str, str]:
    """Return ``Authorization`` header for a fixture user dict."""
    token = user["token"]
    assert isinstance(token, str), "user['token'] must be a str"
    return {"Authorization": f"Bearer {token}"}


class FakeEmailSender:
    """Test email sender — captures every message in ``outbox`` so tests
    can assert subject / recipient / extract the verification token.

    Drop-in replacement for ``app.core.email.ConsoleEmailSender`` via the
    ``EmailSender`` Protocol — no inheritance needed.
    """

    def __init__(self) -> None:
        self.outbox: list[dict[str, str]] = []

    async def send(
        self,
        *,
        to: str,
        subject: str,
        body: str,
        html: str | None = None,
    ) -> None:
        self.outbox.append({"to": to, "subject": subject, "body": body, "html": html or ""})

    def reset(self) -> None:
        self.outbox.clear()

    def last(self) -> dict[str, str]:
        assert self.outbox, "no email was sent"
        return self.outbox[-1]


@pytest_asyncio.fixture
async def fake_email_sender() -> AsyncGenerator[FakeEmailSender, None]:
    """Patch ``app.core.email.get_email_sender`` to return a fake.

    Tests that need to inspect sent mail depend on this fixture, then
    call ``fake_email_sender.last()``. Tests that don't care about email
    keep the default console sender.
    """
    from app.core import email as email_module

    fake = FakeEmailSender()
    email_module._sender = fake
    yield fake
    email_module.reset_email_sender()
