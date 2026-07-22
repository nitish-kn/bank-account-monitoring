"""revise alembic

Revision ID: ec72529e1884
Revises: 20260721_0001
Create Date: 2026-07-22 12:23:32.238702

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ec72529e1884'
down_revision: Union[str, Sequence[str], None] = '20260721_0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
