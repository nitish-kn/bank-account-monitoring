from sqlalchemy import Column, ForeignKey, String, DateTime
from ..database import Base
from ..core.constants import ID_TYPE
import uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func


class TransactionLog(Base):
    __tablename__ = "transaction_logs"

    id = Column(ID_TYPE, primary_key=True, autoincrement=True)
    user_id = Column(ID_TYPE, ForeignKey("users.id"), nullable=False, index=True)

    txn_id = Column(String, ForeignKey("transactions.id"), nullable=False, index=True)

    changes = Column(JSONB)

    reason = Column(String)

    ip_address = Column(String, nullable=False)

    changed_by = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="transaction_logs")
    transactions = relationship("Transactions", back_populates="transaction_logs")