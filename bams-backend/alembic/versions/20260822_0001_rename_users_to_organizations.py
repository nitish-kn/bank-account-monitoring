"""rename users table to organizations

Revision ID: 20260822_0001
Revises: 20260813_0001
Create Date: 2026-08-22

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "20260822_0001"
down_revision: Union[str, Sequence[str], None] = "20260813_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Table rename ---
    op.execute("ALTER TABLE users RENAME TO organizations")

    # --- Column renames ---
    op.execute("ALTER TABLE transactions RENAME COLUMN user_id TO org_id")
    op.execute("ALTER TABLE bank_accounts RENAME COLUMN user_id TO org_id")
    op.execute("ALTER TABLE parsed RENAME COLUMN user_id TO org_id")
    op.execute("ALTER TABLE transaction_logs RENAME COLUMN user_id TO org_id")
    op.execute("ALTER TABLE chat_sessions RENAME COLUMN user_id TO org_id")
    op.execute("ALTER TABLE chat_messages RENAME COLUMN user_id TO org_id")
    op.execute("ALTER TABLE chat_tool_calls RENAME COLUMN user_id TO org_id")
    op.execute("ALTER TABLE user_sheets RENAME COLUMN user_id TO org_id")
    op.execute("ALTER TABLE invites RENAME COLUMN invited_by_user_id TO invited_by_org_id")
    op.execute("ALTER TABLE invites RENAME COLUMN invited_user_id TO invited_org_id")
    op.execute("ALTER TABLE families RENAME COLUMN owner_user_id TO owner_org_id")

    # --- Foreign key constraint renames. Purely cosmetic: Postgres tracks FKs by the
    # referenced table's OID, not its name, so these kept working the instant the table
    # was renamed above. Renamed here so the names stay in sync with what SQLAlchemy's
    # default naming convention now generates for the model, keeping future
    # `alembic revision --autogenerate` diffs clean. ---
    op.execute("ALTER TABLE organizations RENAME CONSTRAINT users_family_id_fkey TO organizations_family_id_fkey")
    op.execute("ALTER TABLE transactions RENAME CONSTRAINT transactions_user_id_fkey TO transactions_org_id_fkey")
    op.execute("ALTER TABLE bank_accounts RENAME CONSTRAINT bank_accounts_user_id_fkey TO bank_accounts_org_id_fkey")
    op.execute("ALTER TABLE parsed RENAME CONSTRAINT parsed_user_id_fkey TO parsed_org_id_fkey")
    op.execute("ALTER TABLE transaction_logs RENAME CONSTRAINT transaction_logs_user_id_fkey TO transaction_logs_org_id_fkey")
    op.execute("ALTER TABLE chat_sessions RENAME CONSTRAINT chat_sessions_user_id_fkey TO chat_sessions_org_id_fkey")
    op.execute("ALTER TABLE chat_messages RENAME CONSTRAINT chat_messages_user_id_fkey TO chat_messages_org_id_fkey")
    op.execute("ALTER TABLE chat_tool_calls RENAME CONSTRAINT chat_tool_calls_user_id_fkey TO chat_tool_calls_org_id_fkey")
    op.execute("ALTER TABLE user_sheets RENAME CONSTRAINT user_sheets_user_id_fkey TO user_sheets_org_id_fkey")
    op.execute("ALTER TABLE invites RENAME CONSTRAINT invites_invited_by_user_id_fkey TO invites_invited_by_org_id_fkey")
    op.execute("ALTER TABLE invites RENAME CONSTRAINT invites_invited_user_id_fkey TO invites_invited_org_id_fkey")
    op.execute("ALTER TABLE families RENAME CONSTRAINT families_owner_user_id_fkey TO families_owner_org_id_fkey")

    # --- Unique constraint renames (also renames their backing index) ---
    op.execute("ALTER TABLE transactions RENAME CONSTRAINT uq_transactions_user_dedupe_key TO uq_transactions_org_dedupe_key")
    op.execute("ALTER TABLE parsed RENAME CONSTRAINT uq_parsed_user_gmail_message_id TO uq_parsed_org_gmail_message_id")

    # --- Index renames ---
    op.execute("ALTER INDEX ix_users_email RENAME TO ix_organizations_email")
    op.execute("ALTER INDEX ix_users_family_id RENAME TO ix_organizations_family_id")
    op.execute("ALTER INDEX ix_users_google_id RENAME TO ix_organizations_google_id")
    op.execute("ALTER INDEX ix_users_sync_status RENAME TO ix_organizations_sync_status")
    op.execute("ALTER INDEX ix_transactions_user_id RENAME TO ix_transactions_org_id")
    op.execute("ALTER INDEX ix_bank_accounts_user_id RENAME TO ix_bank_accounts_org_id")
    op.execute("ALTER INDEX ix_parsed_user_id RENAME TO ix_parsed_org_id")
    op.execute("ALTER INDEX ix_transaction_logs_user_id RENAME TO ix_transaction_logs_org_id")
    op.execute("ALTER INDEX ix_chat_sessions_user_id RENAME TO ix_chat_sessions_org_id")
    op.execute("ALTER INDEX ix_chat_sessions_user_last_msg RENAME TO ix_chat_sessions_org_last_msg")
    op.execute("ALTER INDEX ix_chat_messages_user_id RENAME TO ix_chat_messages_org_id")
    op.execute("ALTER INDEX ix_invites_invited_by_user_id RENAME TO ix_invites_invited_by_org_id")
    op.execute("ALTER INDEX ix_invites_invited_user_id RENAME TO ix_invites_invited_org_id")
    op.execute("ALTER INDEX ix_families_owner_user_id RENAME TO ix_families_owner_org_id")

    # --- user_sheets -> org_sheets (same rename, one table over) ---
    op.execute("ALTER TABLE user_sheets RENAME TO org_sheets")
    op.execute("ALTER TABLE org_sheets RENAME CONSTRAINT user_sheets_org_id_fkey TO org_sheets_org_id_fkey")
    op.execute("ALTER INDEX ix_user_sheets_sheet_id RENAME TO ix_org_sheets_sheet_id")


def downgrade() -> None:
    # --- org_sheets -> user_sheets (reverse) ---
    op.execute("ALTER INDEX ix_org_sheets_sheet_id RENAME TO ix_user_sheets_sheet_id")
    op.execute("ALTER TABLE org_sheets RENAME CONSTRAINT org_sheets_org_id_fkey TO user_sheets_org_id_fkey")
    op.execute("ALTER TABLE org_sheets RENAME TO user_sheets")

    # --- Index renames (reverse) ---
    op.execute("ALTER INDEX ix_organizations_email RENAME TO ix_users_email")
    op.execute("ALTER INDEX ix_organizations_family_id RENAME TO ix_users_family_id")
    op.execute("ALTER INDEX ix_organizations_google_id RENAME TO ix_users_google_id")
    op.execute("ALTER INDEX ix_organizations_sync_status RENAME TO ix_users_sync_status")
    op.execute("ALTER INDEX ix_transactions_org_id RENAME TO ix_transactions_user_id")
    op.execute("ALTER INDEX ix_bank_accounts_org_id RENAME TO ix_bank_accounts_user_id")
    op.execute("ALTER INDEX ix_parsed_org_id RENAME TO ix_parsed_user_id")
    op.execute("ALTER INDEX ix_transaction_logs_org_id RENAME TO ix_transaction_logs_user_id")
    op.execute("ALTER INDEX ix_chat_sessions_org_id RENAME TO ix_chat_sessions_user_id")
    op.execute("ALTER INDEX ix_chat_sessions_org_last_msg RENAME TO ix_chat_sessions_user_last_msg")
    op.execute("ALTER INDEX ix_chat_messages_org_id RENAME TO ix_chat_messages_user_id")
    op.execute("ALTER INDEX ix_invites_invited_by_org_id RENAME TO ix_invites_invited_by_user_id")
    op.execute("ALTER INDEX ix_invites_invited_org_id RENAME TO ix_invites_invited_user_id")
    op.execute("ALTER INDEX ix_families_owner_org_id RENAME TO ix_families_owner_user_id")

    # --- Unique constraint renames (reverse) ---
    op.execute("ALTER TABLE transactions RENAME CONSTRAINT uq_transactions_org_dedupe_key TO uq_transactions_user_dedupe_key")
    op.execute("ALTER TABLE parsed RENAME CONSTRAINT uq_parsed_org_gmail_message_id TO uq_parsed_user_gmail_message_id")

    # --- Foreign key constraint renames (reverse) ---
    op.execute("ALTER TABLE organizations RENAME CONSTRAINT organizations_family_id_fkey TO users_family_id_fkey")
    op.execute("ALTER TABLE transactions RENAME CONSTRAINT transactions_org_id_fkey TO transactions_user_id_fkey")
    op.execute("ALTER TABLE bank_accounts RENAME CONSTRAINT bank_accounts_org_id_fkey TO bank_accounts_user_id_fkey")
    op.execute("ALTER TABLE parsed RENAME CONSTRAINT parsed_org_id_fkey TO parsed_user_id_fkey")
    op.execute("ALTER TABLE transaction_logs RENAME CONSTRAINT transaction_logs_org_id_fkey TO transaction_logs_user_id_fkey")
    op.execute("ALTER TABLE chat_sessions RENAME CONSTRAINT chat_sessions_org_id_fkey TO chat_sessions_user_id_fkey")
    op.execute("ALTER TABLE chat_messages RENAME CONSTRAINT chat_messages_org_id_fkey TO chat_messages_user_id_fkey")
    op.execute("ALTER TABLE chat_tool_calls RENAME CONSTRAINT chat_tool_calls_org_id_fkey TO chat_tool_calls_user_id_fkey")
    op.execute("ALTER TABLE user_sheets RENAME CONSTRAINT user_sheets_org_id_fkey TO user_sheets_user_id_fkey")
    op.execute("ALTER TABLE invites RENAME CONSTRAINT invites_invited_by_org_id_fkey TO invites_invited_by_user_id_fkey")
    op.execute("ALTER TABLE invites RENAME CONSTRAINT invites_invited_org_id_fkey TO invites_invited_user_id_fkey")
    op.execute("ALTER TABLE families RENAME CONSTRAINT families_owner_org_id_fkey TO families_owner_user_id_fkey")

    # --- Column renames (reverse) ---
    op.execute("ALTER TABLE transactions RENAME COLUMN org_id TO user_id")
    op.execute("ALTER TABLE bank_accounts RENAME COLUMN org_id TO user_id")
    op.execute("ALTER TABLE parsed RENAME COLUMN org_id TO user_id")
    op.execute("ALTER TABLE transaction_logs RENAME COLUMN org_id TO user_id")
    op.execute("ALTER TABLE chat_sessions RENAME COLUMN org_id TO user_id")
    op.execute("ALTER TABLE chat_messages RENAME COLUMN org_id TO user_id")
    op.execute("ALTER TABLE chat_tool_calls RENAME COLUMN org_id TO user_id")
    op.execute("ALTER TABLE user_sheets RENAME COLUMN org_id TO user_id")
    op.execute("ALTER TABLE invites RENAME COLUMN invited_by_org_id TO invited_by_user_id")
    op.execute("ALTER TABLE invites RENAME COLUMN invited_org_id TO invited_user_id")
    op.execute("ALTER TABLE families RENAME COLUMN owner_org_id TO owner_user_id")

    # --- Table rename (reverse) ---
    op.execute("ALTER TABLE organizations RENAME TO users")
