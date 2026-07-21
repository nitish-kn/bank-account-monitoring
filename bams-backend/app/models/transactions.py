from ..database import Base
from sqlalchemy import Column, DateTime, String, ForeignKey, Numeric, UniqueConstraint, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from .types import ID_TYPE
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from uuid import uuid4

class Transactions(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        UniqueConstraint("user_id", "dedupe_key", name="uq_transactions_user_dedupe_key"),
    )

    id = Column(String, primary_key=True)

    user_id = Column(ID_TYPE, ForeignKey("users.id"), nullable=False, index=True)

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
    
    optional_fields = Column(JSONB)

    sheets_synced_at = Column(DateTime(timezone=True), nullable=True)

    is_flag = Column(Boolean, nullable=False, default=False, server_default="false")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="transactions")  # or appropriate name
