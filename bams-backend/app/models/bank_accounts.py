from sqlalchemy import Column, ForeignKey, String, Numeric, DateTime
from ..database import Base
from .types import ID_TYPE
from sqlalchemy.orm import relationship

class BankAccounts(Base):
    __tablename__ = "bank_accounts"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(ID_TYPE, ForeignKey("users.id"), nullable=False, index=True)
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

    user = relationship("User", back_populates="bank_accounts")
