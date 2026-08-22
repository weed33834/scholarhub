"""merge 013_user_two_factor and 016_publisher

Revision ID: 51688fb04bf7
Revises: 013_user_two_factor, 016_publisher
Create Date: 2026-08-06 16:20:13.525871
"""

from __future__ import annotations

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = '51688fb04bf7'
down_revision: str | None = ('013_user_two_factor', '016_publisher')
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
