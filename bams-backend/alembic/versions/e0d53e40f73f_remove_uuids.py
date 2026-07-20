"""remove uuids

Revision ID: e0d53e40f73f
Revises: 004d80e2fe0b
Create Date: 2026-07-17 17:19:13.799717

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e0d53e40f73f'
down_revision: Union[str, Sequence[str], None] = '004d80e2fe0b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
