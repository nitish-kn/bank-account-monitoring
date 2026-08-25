from sqlalchemy import Column, ForeignKey, String, DateTime
from ..database import Base
from .types import ID_TYPE
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(String, primary_key=True)
    org_id = Column(ID_TYPE, ForeignKey("organizations.id"), nullable=False, index=True)

    title = Column(String, nullable=True)
    last_message_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    org = relationship("Organization", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")
