"""add investment_accounts and holdings tables

Revision ID: 20261027_0001
Revises: 20261006_0001
Create Date: 2026-10-27

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "20261027_0001"
down_revision: Union[str, Sequence[str], None] = "20261006_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS investment_accounts (
            id VARCHAR PRIMARY KEY,
            org_id BIGINT NOT NULL REFERENCES organizations(id),
            holder_name VARCHAR NOT NULL,
            depository VARCHAR NOT NULL,
            broker_name VARCHAR NOT NULL,
            account_key VARCHAR NOT NULL,
            nominee_status VARCHAR,
            kite_api_key VARCHAR,
            kite_api_secret_encrypted VARCHAR,
            kite_user_id VARCHAR,
            kite_last_synced_at TIMESTAMP WITH TIME ZONE,
            kite_last_sync_status VARCHAR,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE,
            CONSTRAINT uq_investment_accounts_org_account_key UNIQUE (org_id, account_key)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS holdings (
            id VARCHAR PRIMARY KEY,
            account_id VARCHAR NOT NULL REFERENCES investment_accounts(id) ON DELETE CASCADE,
            as_of_date DATE NOT NULL,
            isin VARCHAR NOT NULL,
            symbol VARCHAR,
            name VARCHAR,
            investment_type VARCHAR NOT NULL,
            quantity NUMERIC(18, 3) NOT NULL,
            price_on_date NUMERIC(14, 4),
            cost_per_quantity NUMERIC(14, 4),
            note VARCHAR,
            source VARCHAR NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE,
            CONSTRAINT uq_holdings_account_isin_date_source UNIQUE (account_id, isin, as_of_date, source)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_investment_accounts_org_id ON investment_accounts (org_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_investment_accounts_holder_name ON investment_accounts (holder_name)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS holdings")
    op.execute("DROP TABLE IF EXISTS investment_accounts")
