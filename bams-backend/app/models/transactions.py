from ..database import Base
from sqlalchemy import Column, DateTime, Integer, String, Numeric
from sqlalchemy.dialects.postgresql import JSONB


class Transactions(Base):
    __tablename__ = "transactions"

    id = Column(String, primary_key=True, index=True)

    gmail_message_id = Column(String, index=True)

    bank_name = Column(String, nullable=False)
    account_holder_name = Column(String, nullable=False)
    account_type = Column(String)
    account_number = Column(String, nullable=False)

    txn_type = Column(String, nullable=False)
    mode = Column(String)
    category = Column(String)

    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String, default="INR")

    txn_date = Column(DateTime(timezone=True))

    counterparty = Column(String, nullable=False)
    counterparty_kind = Column(String)

    narration = Column(String, nullable=False)
    txn_via = Column(String, nullable=False, default="Bank Transaction")

    ref_number = Column(String, nullable=False, index=True)

    place = Column(String)
    balance_after_txn = Column(Numeric(12, 2))

    source = Column(String, nullable=False)

    dedupe_key = Column(String, nullable=False, index=True)
    email_metadata = Column(JSONB)
    parser_metadata = Column(JSONB)
    raw_data = Column(JSONB)
    optional_fields = Column(JSONB)

    created_at = Column(DateTime(timezone=True), server_default="now()")
    updated_at = Column(DateTime(timezone=True), onupdate="now()")