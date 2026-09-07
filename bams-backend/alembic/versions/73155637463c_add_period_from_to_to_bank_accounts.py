"""add period_from/period_to to bank_accounts

Revision ID: 73155637463c
Revises: c53a685af303
Create Date: 2026-08-31 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '73155637463c'
down_revision: Union[str, Sequence[str], None] = 'c53a685af303'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('bank_accounts', sa.Column('period_from', sa.DateTime(timezone=True), nullable=True))
    op.add_column('bank_accounts', sa.Column('period_to', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('bank_accounts', 'period_to')
    op.drop_column('bank_accounts', 'period_from')
