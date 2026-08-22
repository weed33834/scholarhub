"""add tenant_hosts table for multi-tenant host-header resolution

Revision ID: 017_tenant_hosts
Revises: 016_publisher
Create Date: 2026-08-06

This table maps domain names (host headers) to tenants. It is NOT
tenant-scoped via RLS because it is exactly the table that the
middleware queries *before* the tenant context is established.
Access is controlled at the application layer (admin endpoints only).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "017_tenant_hosts"
down_revision: str | None = "016_publisher"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tenant_hosts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("host", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tenant_hosts_tenant_id", "tenant_hosts", ["tenant_id"])
    op.create_index("ix_tenant_hosts_host", "tenant_hosts", ["host"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_tenant_hosts_host", table_name="tenant_hosts")
    op.drop_index("ix_tenant_hosts_tenant_id", table_name="tenant_hosts")
    op.drop_table("tenant_hosts")
