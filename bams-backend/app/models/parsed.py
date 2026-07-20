from ..database import Base
from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from .types import ID_TYPE
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from uuid import uuid4

class Parsed(Base):
    __tablename__ = "parsed"
    __table_args__ = (
        UniqueConstraint("user_id", "gmail_message_id", name="uq_parsed_user_gmail_message_id"),
    )

    id = Column(ID_TYPE, primary_key=True)
    user_id = Column(ID_TYPE, ForeignKey("users.id"), nullable=False, index=True)
    gmail_message_id = Column(String, nullable=False)
    status = Column(String, nullable=False)
    optional = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate="now()")

    user = relationship("User", back_populates="parsed")  # or appropriate name
