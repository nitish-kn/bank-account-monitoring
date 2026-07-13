"""Drop legacy pgloader-style duplicate indexes.

Revision ID: 20260707_0002
Revises: 20260707_0001
Create Date: 2026-07-07

"""
from typing import Sequence, Union

from alembic import op


revision: str = "20260707_0002"
down_revision: Union[str, Sequence[str], None] = "20260707_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    if op.get_bind().dialect.name != "postgresql":
        return

    op.execute(
        """
        DO $$
        DECLARE
            legacy_index record;
        BEGIN
            FOR legacy_index IN
                SELECT schemaname, indexname
                FROM pg_indexes
                WHERE schemaname = current_schema()
                  AND tablename IN ('users', 'families', 'invites', 'user_sheets')
                  AND indexname ~ '^idx_[0-9]+_ix_'
                  AND indexname NOT IN (
                      SELECT conname
                      FROM pg_constraint
                      WHERE contype IN ('p', 'u')
                  )
            LOOP
                EXECUTE format(
                    'DROP INDEX IF EXISTS %I.%I',
                    legacy_index.schemaname,
                    legacy_index.indexname
                );
            END LOOP;
        END $$;
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    pass
