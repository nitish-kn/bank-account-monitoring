"""allow nullable transaction amount

Revision ID: 20260721_0001
Revises: 77098d81d604
Create Date: 2026-07-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260721_0001"
down_revision: Union[str, Sequence[str], None] = "77098d81d604"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Allow parsed review rows that do not contain an amount."""
    op.alter_column(
        "transactions",
        "amount",
        existing_type=sa.Numeric(precision=12, scale=2),
        nullable=True,
    )


def downgrade() -> None:
    """Restore the previous strict amount requirement."""
    op.alter_column(
        "transactions",
        "amount",
        existing_type=sa.Numeric(precision=12, scale=2),
        nullable=False,
    )
