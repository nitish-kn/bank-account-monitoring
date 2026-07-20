"""Add txn_time to transactions

Revision ID: 303e85de0cbe
Revises: 7531343749d2
Create Date: 2026-07-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '303e85de0cbe'
down_revision: Union[str, Sequence[str], None] = '7531343749d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'transactions',
        sa.Column('txn_time', sa.String(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('transactions', 'txn_time')
