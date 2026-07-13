from sqlalchemy import Column, String, Numeric, DateTime
from ..database import Base


class BankAccounts(Base):
    __tablename__ = "bank_accounts"

    id = Column(String, primary_key=True, index=True)
    bank_name = Column(String, nullable=False)
    account_holder_name = Column(String, nullable=False)
    account_type = Column(String)
    account_number = Column(String, nullable=False)
    current_balance = Column(Numeric(12, 2))
    statement_balance = Column(Numeric(12, 2))
    last_synced_at = Column(DateTime(timezone=True))
    source = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default="now()")
    updated_at = Column(DateTime(timezone=True), onupdate="now()")