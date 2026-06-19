from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    google_id = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    name = Column(String)
    picture = Column(String, nullable=True)
    access_token = Column(String)
    refresh_token = Column(String, nullable=True)
    token_expiry = Column(DateTime, nullable=True)
    has_email_permissions = Column(Boolean, default=False, nullable=False, server_default='false')
    has_sheets_permissions = Column(Boolean, default=False, nullable=False, server_default='false')
    is_setup_completed = Column(Boolean, default=False, nullable=False, server_default='false')
    spreadsheet_id = Column(String, nullable=True)
    family_id = Column(Integer, ForeignKey("families.id"), nullable=True, index=True)
    last_synced_at = Column(DateTime, nullable=True)
    last_synced_status = Column(String, default="not_started", nullable=False, server_default='not_started')
    last_synced_email_date = Column(DateTime, nullable=True)
    sync_status = Column(String, default="not_started", nullable=False, server_default='not_started', index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    family = relationship("Family", foreign_keys=[family_id], back_populates="members")
