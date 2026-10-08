"""add transactions tally_synced_at

Revision ID: 20260930_0001
Revises: a4c7e3f9d1b2
Create Date: 2026-09-30

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "20260930_0001"
down_revision: Union[str, Sequence[str], None] = "a4c7e3f9d1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE transactions "
        "ADD COLUMN IF NOT EXISTS tally_synced_at TIMESTAMP WITH TIME ZONE NULL"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE transactions DROP COLUMN IF EXISTS tally_synced_at")
