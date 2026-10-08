"""add transactions tally_voucher

Revision ID: 20261006_0001
Revises: 20260930_0001
Create Date: 2026-10-06

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "20261006_0001"
down_revision: Union[str, Sequence[str], None] = "20260930_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tally_voucher JSONB NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE transactions DROP COLUMN IF EXISTS tally_voucher")
