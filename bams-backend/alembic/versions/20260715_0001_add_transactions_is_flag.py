"""add transactions is_flag

Revision ID: 20260715_0001
Revises: c382ee1d068b
Create Date: 2026-07-15

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "20260715_0001"
down_revision: Union[str, Sequence[str], None] = "c382ee1d068b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE transactions "
        "ADD COLUMN IF NOT EXISTS is_flag BOOLEAN NOT NULL DEFAULT false"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE transactions DROP COLUMN IF EXISTS is_flag")
