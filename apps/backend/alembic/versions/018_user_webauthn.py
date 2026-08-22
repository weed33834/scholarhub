"""users: add webauthn_credentials JSONB column

Revision ID: 018_user_webauthn
Revises: 017_tenant_hosts
Create Date: 2026-08-06 12:00:00

Adds ``webauthn_credentials`` (jsonb, nullable) to ``users`` for storing
registered passkey / WebAuthn credential metadata. Each entry is a dict:

    {
        "id": "<base64url credential id>",
        "public_key": "<base64url public key bytes>",
        "sign_count": <int>,
        "name": "<human label, e.g. 'YubiKey 5C'>",
        "created_at": "<ISO 8601 UTC>",
        "transports": ["usb", "nfc", ...],
    }
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "018_user_webauthn"
down_revision: str | None = "017_tenant_hosts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "users"


def upgrade() -> None:
    op.add_column(
        _TABLE,
        sa.Column(
            "webauthn_credentials",
            postgresql.JSONB(astext_type=sa.Text()).with_variant(
                sa.JSON(), "sqlite"
            ),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column(_TABLE, "webauthn_credentials")
