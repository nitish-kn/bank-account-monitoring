from sqlalchemy import Column, ForeignKey, String, Numeric, DateTime
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
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    org = relationship("Organization", back_populates="bank_accounts")
