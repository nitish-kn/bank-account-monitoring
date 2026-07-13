"""PostgreSQL baseline and migrated schema repair.

Revision ID: 20260707_0001
Revises:
Create Date: 2026-07-07

"""
from typing import Sequence, Union

from alembic import op


revision: str = "20260707_0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ID_TABLES = ("users", "families", "invites", "user_sheets")


def _is_postgresql() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def _ensure_id_sequence(table_name: str) -> None:
    sequence_name = f"{table_name}_id_seq"
    op.execute(f"CREATE SEQUENCE IF NOT EXISTS {sequence_name}")
    op.execute(f"ALTER SEQUENCE {sequence_name} OWNED BY {table_name}.id")
    op.execute(
        f"ALTER TABLE {table_name} "
        f"ALTER COLUMN id SET DEFAULT nextval('{sequence_name}')"
    )
    op.execute(
        f"SELECT setval("
        f"'{sequence_name}', "
        f"COALESCE((SELECT MAX(id) FROM {table_name}), 0) + 1, "
        f"false"
        f")"
    )


def _set_not_null_if_clean(table_name: str, column_name: str) -> None:
    op.execute(
        f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM {table_name} WHERE {column_name} IS NULL) THEN
                RAISE EXCEPTION
                    'Cannot set %.% NOT NULL because NULL values exist',
                    '{table_name}',
                    '{column_name}';
            END IF;

            ALTER TABLE {table_name} ALTER COLUMN {column_name} SET NOT NULL;
        END $$;
        """
    )


def upgrade() -> None:
    """Upgrade schema."""
    if not _is_postgresql():
        return

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id BIGSERIAL PRIMARY KEY,
            google_id VARCHAR,
            email VARCHAR,
            name VARCHAR,
            picture VARCHAR,
            access_token VARCHAR,
            refresh_token VARCHAR,
            token_expiry TIMESTAMP,
            has_email_permissions BOOLEAN NOT NULL DEFAULT false,
            has_sheets_permissions BOOLEAN NOT NULL DEFAULT false,
            is_setup_completed BOOLEAN NOT NULL DEFAULT false,
            spreadsheet_id VARCHAR,
            family_id BIGINT,
            last_synced_at TIMESTAMP,
            last_synced_status VARCHAR NOT NULL DEFAULT 'not_started',
            last_synced_email_date TIMESTAMP,
            sync_status VARCHAR NOT NULL DEFAULT 'not_started',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE,
            UNIQUE (google_id),
            UNIQUE (email)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS families (
            id BIGSERIAL PRIMARY KEY,
            name VARCHAR,
            owner_user_id BIGINT NOT NULL REFERENCES users(id),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE
        )
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'users_family_id_fkey'
                  AND conrelid = 'users'::regclass
            ) THEN
                ALTER TABLE users
                    ADD CONSTRAINT users_family_id_fkey
                    FOREIGN KEY (family_id) REFERENCES families(id);
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS invites (
            id BIGSERIAL PRIMARY KEY,
            family_id BIGINT NOT NULL REFERENCES families(id),
            invited_by_user_id BIGINT NOT NULL REFERENCES users(id),
            invited_user_id BIGINT REFERENCES users(id),
            invited_email VARCHAR NOT NULL,
            invite_type VARCHAR NOT NULL DEFAULT 'family_invite',
            status VARCHAR NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE,
            expires_at TIMESTAMP WITH TIME ZONE,
            accepted_at TIMESTAMP WITH TIME ZONE,
            declined_at TIMESTAMP WITH TIME ZONE
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_sheets (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT REFERENCES users(id),
            sheet_id VARCHAR UNIQUE,
            title VARCHAR
        )
        """
    )

    for table_name in ID_TABLES:
        _ensure_id_sequence(table_name)

    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id ON users (google_id)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_family_id ON users (family_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_sync_status ON users (sync_status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_families_owner_user_id ON families (owner_user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invites_family_id ON invites (family_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invites_invited_by_user_id ON invites (invited_by_user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invites_invited_user_id ON invites (invited_user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invites_invited_email ON invites (invited_email)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invites_invite_type ON invites (invite_type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invites_status ON invites (status)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_user_sheets_sheet_id ON user_sheets (sheet_id)")

    op.execute("UPDATE users SET has_email_permissions = false WHERE has_email_permissions IS NULL")
    op.execute("UPDATE users SET has_sheets_permissions = false WHERE has_sheets_permissions IS NULL")
    op.execute("UPDATE users SET is_setup_completed = false WHERE is_setup_completed IS NULL")
    op.execute("UPDATE users SET last_synced_status = 'not_started' WHERE last_synced_status IS NULL")
    op.execute("UPDATE users SET sync_status = 'not_started' WHERE sync_status IS NULL")
    op.execute("ALTER TABLE users ALTER COLUMN has_email_permissions SET DEFAULT false")
    op.execute("ALTER TABLE users ALTER COLUMN has_sheets_permissions SET DEFAULT false")
    op.execute("ALTER TABLE users ALTER COLUMN is_setup_completed SET DEFAULT false")
    op.execute("ALTER TABLE users ALTER COLUMN last_synced_status SET DEFAULT 'not_started'")
    op.execute("ALTER TABLE users ALTER COLUMN sync_status SET DEFAULT 'not_started'")
    op.execute("ALTER TABLE users ALTER COLUMN has_email_permissions SET NOT NULL")
    op.execute("ALTER TABLE users ALTER COLUMN has_sheets_permissions SET NOT NULL")
    op.execute("ALTER TABLE users ALTER COLUMN is_setup_completed SET NOT NULL")
    op.execute("ALTER TABLE users ALTER COLUMN last_synced_status SET NOT NULL")
    op.execute("ALTER TABLE users ALTER COLUMN sync_status SET NOT NULL")

    _set_not_null_if_clean("families", "owner_user_id")

    op.execute("UPDATE invites SET invite_type = 'family_invite' WHERE invite_type IS NULL")
    op.execute("UPDATE invites SET status = 'pending' WHERE status IS NULL")
    op.execute("ALTER TABLE invites ALTER COLUMN invite_type SET DEFAULT 'family_invite'")
    op.execute("ALTER TABLE invites ALTER COLUMN status SET DEFAULT 'pending'")
    _set_not_null_if_clean("invites", "family_id")
    _set_not_null_if_clean("invites", "invited_by_user_id")
    _set_not_null_if_clean("invites", "invited_email")
    op.execute("ALTER TABLE invites ALTER COLUMN invite_type SET NOT NULL")
    op.execute("ALTER TABLE invites ALTER COLUMN status SET NOT NULL")


def downgrade() -> None:
    """Downgrade schema."""
    if not _is_postgresql():
        return

    for table_name in ID_TABLES:
        sequence_name = f"{table_name}_id_seq"
        op.execute(f"ALTER TABLE {table_name} ALTER COLUMN id DROP DEFAULT")
        op.execute(f"DROP SEQUENCE IF EXISTS {sequence_name}")

    op.execute("ALTER TABLE users ALTER COLUMN has_email_permissions DROP NOT NULL")
    op.execute("ALTER TABLE users ALTER COLUMN has_sheets_permissions DROP NOT NULL")
    op.execute("ALTER TABLE users ALTER COLUMN is_setup_completed DROP NOT NULL")
    op.execute("ALTER TABLE users ALTER COLUMN last_synced_status DROP NOT NULL")
    op.execute("ALTER TABLE users ALTER COLUMN sync_status DROP NOT NULL")
    op.execute("ALTER TABLE families ALTER COLUMN owner_user_id DROP NOT NULL")
    op.execute("ALTER TABLE invites ALTER COLUMN family_id DROP NOT NULL")
    op.execute("ALTER TABLE invites ALTER COLUMN invited_by_user_id DROP NOT NULL")
    op.execute("ALTER TABLE invites ALTER COLUMN invited_email DROP NOT NULL")
    op.execute("ALTER TABLE invites ALTER COLUMN invite_type DROP NOT NULL")
    op.execute("ALTER TABLE invites ALTER COLUMN status DROP NOT NULL")
