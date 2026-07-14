from ..database import Base
from sqlalchemy import Column, String, Numeric, DateTime, ForeignKey
from .types import ID_TYPE
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

class Parsed(Base):
    __tablename__ = "parsed"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(ID_TYPE, ForeignKey("users.id"), nullable=False, index=True)
    gmail_message_id = Column(String, nullable=False)
    status = Column(String, nullable=False)
    optional = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default="now()")
    updated_at = Column(DateTime(timezone=True), onupdate="now()")

    user = relationship("User", back_populates="parsed")  # or appropriate name
