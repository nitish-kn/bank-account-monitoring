from ..database import Base
from sqlalchemy import Column, String, Numeric, DateTime
from sqlalchemy.dialects.postgresql import JSONB

class Parsed(Base):
    __tablename__ = "parsed"

    id = Column(String, primary_key=True, index=True)
    gmail_message_id = Column(String, nullable=False)
    status = Column(String, nullable=False)
    optional = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default="now()")
    updated_at = Column(DateTime(timezone=True), onupdate="now()")