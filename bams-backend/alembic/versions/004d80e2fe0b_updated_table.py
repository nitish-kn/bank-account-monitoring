"""updated table

Revision ID: 004d80e2fe0b
Revises: 8ffa26841c13
Create Date: 2026-07-17 16:47:58.810798

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '004d80e2fe0b'
down_revision: Union[str, Sequence[str], None] = '8ffa26841c13'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column('transactions', 'raw_data')


def downgrade() -> None:
    """Downgrade schema."""
    from sqlalchemy.dialects import postgresql
    op.add_column('transactions', sa.Column('raw_data', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True))
