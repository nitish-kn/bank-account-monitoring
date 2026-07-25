"""updated table

Revision ID: 8ffa26841c13
Revises: 20260715_0001
Create Date: 2026-07-16 16:42:53.986792

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8ffa26841c13'
down_revision: Union[str, Sequence[str], None] = '20260715_0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
