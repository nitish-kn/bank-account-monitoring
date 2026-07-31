"""add log table

Revision ID: f392693312dc
Revises: 9156b86dd286
Create Date: 2026-07-31 17:12:24.509437

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f392693312dc'
down_revision: Union[str, Sequence[str], None] = '9156b86dd286'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
