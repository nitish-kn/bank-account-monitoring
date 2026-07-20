"""remove uuids fix

Revision ID: 77098d81d604
Revises: e0d53e40f73f
Create Date: 2026-07-20 12:02:20.288688

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '77098d81d604'
down_revision: Union[str, Sequence[str], None] = 'e0d53e40f73f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
