"""fix organizations sync time columns to be timezone-aware

organizations.last_synced_at / last_synced_email_date were declared as plain
DateTime (no timezone) while every write path hands them an aware UTC value
(utc_now()). Every DB connection this app opens runs with session timezone
Asia/Kolkata (see database.py), so on write, Postgres silently converted that
aware UTC value to IST wall-clock digits and stored them naive. On read, the
serializer (datetime_to_iso) saw a naive value and assumed it was already UTC
-- mislabeling IST digits as UTC, which showed every sync as ~5.5 hours more
recent than it actually was (frontend clamps negative "ago" to 0, so any sync
under 5.5 hours old displayed as "Synced just now" regardless of how long ago
it really happened).

`USING <col> AT TIME ZONE 'Asia/Kolkata'` tells Postgres "these naive digits
are IST wall-clock time" and converts them to the correct absolute instant --
both the schema fix and a correct backfill of existing rows in one step.

Revision ID: a4c7e3f9d1b2
Revises: 8b2f4c1d9e7a
Create Date: 2026-09-24 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a4c7e3f9d1b2'
down_revision: Union[str, Sequence[str], None] = '8b2f4c1d9e7a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(
        "ALTER TABLE organizations "
        "ALTER COLUMN last_synced_at TYPE timestamptz "
        "USING last_synced_at AT TIME ZONE 'Asia/Kolkata'"
    )
    op.execute(
        "ALTER TABLE organizations "
        "ALTER COLUMN last_synced_email_date TYPE timestamptz "
        "USING last_synced_email_date AT TIME ZONE 'Asia/Kolkata'"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(
        "ALTER TABLE organizations "
        "ALTER COLUMN last_synced_at TYPE timestamp "
        "USING last_synced_at AT TIME ZONE 'Asia/Kolkata'"
    )
    op.execute(
        "ALTER TABLE organizations "
        "ALTER COLUMN last_synced_email_date TYPE timestamp "
        "USING last_synced_email_date AT TIME ZONE 'Asia/Kolkata'"
    )
