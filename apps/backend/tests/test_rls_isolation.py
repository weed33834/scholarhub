"""RLS isolation tests — must run against real PostgreSQL.

The main test suite uses SQLite in-memory (which has no Row Level
Security), so ScholarHUB's two-layer isolation claim is verified only
at the application-filter layer there. This file verifies the RLS layer
against a real PostgreSQL instance.

Skipped automatically when ``SCHOLARHUB_DATABASE_URL`` does not
point to PostgreSQL. In CI, this runs as the dedicated ``rls`` job
(``.github/workflows/ci.yml``) with a Postgres 17 service container.

Two implementation notes that make the experiments *meaningful*:

1. **Superusers bypass RLS unconditionally** (even under FORCE ROW
   LEVEL SECURITY). The service/bootstrap role created by POSTGRES_USER
   or a default local install is a superuser, so running these tests
   through it would prove nothing. The fixture therefore bootstraps a
   dedicated NON-superuser role and connects as it for every experiment.

2. **asyncpg refuses multi-command SQL strings** ("cannot insert multiple
   commands into a prepared statement"). Every DDL/DML here is issued one
   statement per ``execute()`` call — mirroring how alembic/versions/001
   applies its policies.

Experimental design:

  Experiment A — application filter correct, RLS enabled:
                user A queries own resources → expects N rows.

  Experiment B — application filter deliberately flawed, RLS enabled:
                user A queries tenant B's resources → expects 0 rows
                (RLS catches the leak).

  Experiment C — same flawed filter, RLS disabled:
                user A queries tenant B's resources → expects N rows
                (demonstrates the leak that RLS prevents).

  Experiment D — no tenant context at all (middleware failure):
                any query → expects 0 rows (fail-closed default deny).

Together B, C and D prove RLS is the layer doing the protection.
"""

from __future__ import annotations

import os
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Skip the entire module when not on PostgreSQL.
DB_URL = os.environ.get("SCHOLARHUB_DATABASE_URL", "")
if not DB_URL.startswith("postgresql"):
    pytest.skip(
        "RLS tests require PostgreSQL; set SCHOLARHUB_DATABASE_URL=postgresql+asyncpg://...",
        allow_module_level=True,
    )

# Non-superuser application role used for every experiment. Superuser
# bypasses RLS, so the tests must never connect through it.
_APP_ROLE = "scholarhub_app"
_APP_PASSWORD = "scholarhub_app_pw"

# Import models so Base.metadata includes catalog tables.
# These imports are intentional side-effects (model registration);
# the symbols themselves are unused, hence noqa: F401.
from app.models import Base  # noqa: E402
from app.modules.catalog.models import Resource  # noqa: E402, F401
from app.modules.library.models import ReadingListItem  # noqa: E402, F401

_RLS_STATEMENTS = [
    "ALTER TABLE resources ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE resources FORCE ROW LEVEL SECURITY",
    """CREATE POLICY rls_resources ON resources
        USING (tenant_id::text = current_setting('app.current_tenant_id', true))""",
    "ALTER TABLE reading_list_items ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE reading_list_items FORCE ROW LEVEL SECURITY",
    """CREATE POLICY rls_rli ON reading_list_items
        USING (tenant_id::text = current_setting('app.current_tenant_id', true))""",
]


def _app_url() -> str:
    return str(make_url(DB_URL).set(username=_APP_ROLE, password=_APP_PASSWORD))


@pytest_asyncio.fixture(loop_scope="module", scope="module")
async def pg_engine():
    """Real PostgreSQL engine bound to a NON-superuser role.

    Bootstrap order:
    1. Through the admin URL (superuser), create the app role if missing
       and grant it schema rights (PG15+ revoked CREATE on public from
       PUBLIC, so an explicit grant is required).
    2. Create schema + enable RLS *as the app role*, so tables are owned
       by the non-superuser and FORCE ROW LEVEL SECURITY actually binds
       the connecting role.

    Scope=module so the schema is created once and reused across tests
    in this file; teardown at module exit.
    """
    admin_engine = create_async_engine(DB_URL, echo=False, isolation_level="AUTOCOMMIT")
    db_name = make_url(DB_URL).database
    async with admin_engine.connect() as conn:
        await conn.execute(
            text(
                f"DO $$ BEGIN "
                f"IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{_APP_ROLE}') THEN "
                f"CREATE ROLE {_APP_ROLE} LOGIN PASSWORD '{_APP_PASSWORD}' "
                f"NOSUPERUSER NOCREATEDB NOCREATEROLE; "
                f"END IF; END $$;"
            )
        )
        await conn.execute(text(f"GRANT CONNECT ON DATABASE {db_name} TO {_APP_ROLE}"))
        await conn.execute(text(f"GRANT USAGE, CREATE ON SCHEMA public TO {_APP_ROLE}"))
    await admin_engine.dispose()

    # Sanity check: fail loudly (with role state) instead of a cryptic
    # "password authentication failed" if bootstrap did not stick.
    probe = create_async_engine(DB_URL, isolation_level="AUTOCOMMIT")
    async with probe.connect() as conn:
        row = (
            await conn.execute(
                text(
                    "SELECT rolname, rolcanlogin, rolsuper FROM pg_roles "
                    f"WHERE rolname = '{_APP_ROLE}'"
                )
            )
        ).first()
    await probe.dispose()
    assert row is not None, f"bootstrap failed: role {_APP_ROLE!r} was not created"
    assert row.rolcanlogin and not row.rolsuper, (
        f"role {_APP_ROLE!r} has wrong flags: login={row.rolcanlogin} super={row.rolsuper}"
    )

    engine = create_async_engine(_app_url(), echo=False)
    async with engine.begin() as conn:
        # Fresh schema owned by the non-superuser app role.
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
        # Apply RLS policies (mirror alembic/versions/001) — one per call,
        # asyncpg cannot prepare multi-command strings.
        for stmt in _RLS_STATEMENTS:
            await conn.execute(text(stmt))
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


async def _seed_two_tenants(session: AsyncSession) -> tuple[uuid.UUID, uuid.UUID]:
    """Insert two tenants and return their UUIDs.

    Slug carries a random tag because tenants.slug is UNIQUE and the
    module-scoped engine keeps data across tests.
    """
    tenant_a = uuid.uuid4()
    tenant_b = uuid.uuid4()
    tag = uuid.uuid4().hex[:8]
    await session.execute(
        text(
            "INSERT INTO tenants (id, slug, name, tenant_type, is_active, created_at, updated_at) "
            "VALUES (:id, :slug, :name, 'journal', true, now(), now())"
        ),
        {"id": tenant_a, "slug": f"tenant-a-{tag}", "name": "Tenant A"},
    )
    await session.execute(
        text(
            "INSERT INTO tenants (id, slug, name, tenant_type, is_active, created_at, updated_at) "
            "VALUES (:id, :slug, :name, 'journal', true, now(), now())"
        ),
        {"id": tenant_b, "slug": f"tenant-b-{tag}", "name": "Tenant B"},
    )
    await session.commit()
    return tenant_a, tenant_b


async def _seed_resources(session: AsyncSession, tenant_a: uuid.UUID, tenant_b: uuid.UUID) -> None:
    """Insert 5 resources per tenant.

    The connection runs as the table owner but FORCE ROW LEVEL SECURITY
    binds owners too (they are not superuser), so each tenant's INSERTs
    need a matching ``app.current_tenant_id`` GUC set within the same
    transaction — exactly what the application middleware does in
    production via ``set_config(..., is_local => true)``.
    """
    for tid in (tenant_a, tenant_b):
        await session.execute(
            text("SELECT set_config('app.current_tenant_id', :tid, true)"),
            {"tid": str(tid)},
        )
        for i in range(5):
            prefix = "a" if tid == tenant_a else "b"
            await session.execute(
                text(
                    "INSERT INTO resources "
                    "(tenant_id, type, title, authors, year, discipline, subdiscipline, "
                    " tags, abstract, preview, doi, publisher, external_url, "
                    " language, publication_status, created_at, updated_at) "
                    "VALUES (:tid, 'article', :title, '[\"A. Author\"]'::jsonb, 2024, "
                    " 'cs', 'ml', '[]'::jsonb, '', '', :doi, 'pub', NULL, "
                    " 'en', 'published', now(), now())"
                ),
                {
                    "tid": tid,
                    "doi": f"10.1000/{prefix}-{i}",
                    "title": f"Tenant {prefix.upper()} resource {i}",
                },
            )
    await session.commit()


@pytest.mark.asyncio(loop_scope="module")
async def test_experiment_a_own_tenant_returns_all_rows(pg_engine):
    """Experiment A: user A queries own resources with RLS enabled.

    The app filter is correct (WHERE tenant_id = A) and RLS is enabled.
    Expected: all 5 of A's rows returned. RLS does not interfere with
    legitimate same-tenant queries.
    """
    Session = async_sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as session:
        tenant_a, tenant_b = await _seed_two_tenants(session)
        await _seed_resources(session, tenant_a, tenant_b)

        # Set RLS context to tenant A.
        await session.execute(
            text(f"SELECT set_config('app.current_tenant_id', '{tenant_a}', true)")
        )
        result = await session.execute(
            text("SELECT count(*) FROM resources WHERE tenant_id = :tid"),
            {"tid": tenant_a},
        )
        count = result.scalar_one()
        assert count == 5, f"expected 5 own-tenant rows, got {count}"


@pytest.mark.asyncio(loop_scope="module")
async def test_experiment_b_rls_catches_cross_tenant_leak(pg_engine):
    """Experiment B: deliberately flawed filter + RLS enabled → 0 leak.

    The app filter is *missing* the correct tenant binding (simulating a
    developer bug): the query asks for tenant B's rows while the RLS
    context is tenant A. RLS should deny every row of tenant B,
    returning 0.

    This is the critical experiment proving the two-layer defense.
    """
    Session = async_sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as session:
        # Re-seed deterministically per test (data persists at module scope).
        tenant_a, tenant_b = await _seed_two_tenants(session)
        await _seed_resources(session, tenant_a, tenant_b)

        # RLS context = tenant A.
        await session.execute(
            text(f"SELECT set_config('app.current_tenant_id', '{tenant_a}', true)")
        )
        result = await session.execute(
            text("SELECT count(*) FROM resources WHERE tenant_id = :tid_b"),
            {"tid_b": tenant_b},
        )
        count = result.scalar_one()
        assert count == 0, (
            f"RLS FAILED: cross-tenant leak detected — "
            f"tenant A context saw {count} of tenant B's rows"
        )


@pytest.mark.asyncio(loop_scope="module")
async def test_experiment_c_disabling_rls_causes_leak(pg_engine):
    """Experiment C: same flawed filter + RLS disabled → leak confirmed.

    Same query as Experiment B, but FORCE ROW LEVEL SECURITY is lifted.
    As table owner (non-superuser), the role then bypasses RLS entirely
    and the flawed filter returns tenant B's rows — demonstrating that
    RLS is the layer providing the protection in Experiment B. FORCE is
    restored afterwards so later experiments keep their preconditions.
    """
    Session = async_sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as session:
        tenant_a, tenant_b = await _seed_two_tenants(session)
        await _seed_resources(session, tenant_a, tenant_b)

        # Disable RLS enforcement for the owner to demonstrate the leak.
        await session.execute(text("ALTER TABLE resources NO FORCE ROW LEVEL SECURITY"))
        # RLS context = tenant A (now irrelevant since FORCE is off).
        await session.execute(
            text(f"SELECT set_config('app.current_tenant_id', '{tenant_a}', true)")
        )
        result = await session.execute(
            text("SELECT count(*) FROM resources WHERE tenant_id = :tid_b"),
            {"tid_b": tenant_b},
        )
        count = result.scalar_one()
        assert count >= 5, (
            f"Expected leak of at least this test's 5 tenant-B rows with RLS "
            f"disabled, got {count}. If this returns 0, the setup is wrong."
        )
        # Restore RLS for subsequent tests.
        await session.execute(text("ALTER TABLE resources FORCE ROW LEVEL SECURITY"))
        await session.commit()


@pytest.mark.asyncio(loop_scope="module")
async def test_rls_default_deny_when_no_context_set(pg_engine):
    """Default-deny: when no app.current_tenant_id is set, RLS returns 0 rows.

    ``current_setting('app.current_tenant_id', true)`` returns NULL when
    the setting is absent (the ``true`` arg = missing_ok). NULL never
    equals a non-null tenant_id, so RLS denies all rows. This is the
    fail-closed behavior that prevents data leaks if middleware fails
    to set the context.
    """
    Session = async_sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as session:
        tenant_a, tenant_b = await _seed_two_tenants(session)
        await _seed_resources(session, tenant_a, tenant_b)

        # Do NOT set app.current_tenant_id — simulates middleware failure.
        # New transaction so the seed's local GUC does not linger.
        await session.rollback()
        result = await session.execute(text("SELECT count(*) FROM resources"))
        count = result.scalar_one()
        assert count == 0, (
            f"Default-deny failed: RLS returned {count} rows when no "
            "tenant context was set. This is a fail-open vulnerability."
        )
