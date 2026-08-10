"""add account category

Revision ID: 0a80ce77ddde
Revises: f392693312dc
Create Date: 2026-08-10 12:15:04.287494

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0a80ce77ddde'
down_revision: Union[str, Sequence[str], None] = 'f392693312dc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
