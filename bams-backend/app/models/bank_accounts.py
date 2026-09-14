from sqlalchemy import Column, ForeignKey, String, Numeric, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from ..database import Base
from .types import ID_TYPE
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

class BankAccounts(Base):
    __tablename__ = "bank_accounts"

    id = Column(String, primary_key=True)
    org_id = Column(ID_TYPE, ForeignKey("organizations.id"), nullable=False, index=True)
    bank_name = Column(String, nullable=False)
    account_holder_name = Column(String, nullable=False)
    account_type = Column(String)
    account_number = Column(String, nullable=False)
    category = Column(String)
    current_balance = Column(Numeric(12, 2))
    statement_balance = Column(Numeric(12, 2))
    last_synced_at = Column(DateTime(timezone=True))
    source = Column(String, nullable=False)

    # Statement coverage: the period the account's statements cover on file.
    # Null until something (a future upload/backfill step) fills it in --
    # not populated by any code path yet.
    period_from = Column(DateTime(timezone=True), nullable=True)
    period_to = Column(DateTime(timezone=True), nullable=True)

    # Stored-PDF info for the statement whose last day this row is (see
    # statement_storage_service.attach_statement_metadata). The DB column is
    # "metadata", but that name is reserved on SQLAlchemy models.
    statement_metadata = Column("metadata", JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    org = relationship("Organization", back_populates="bank_accounts")
