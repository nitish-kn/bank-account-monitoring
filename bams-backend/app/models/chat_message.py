from sqlalchemy import Column, ForeignKey, String, DateTime, Text
from ..database import Base
from .types import ID_TYPE
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(ID_TYPE, ForeignKey("users.id"), nullable=False, index=True)

    role = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    tool_calls = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("ChatSession", back_populates="messages")
    tool_call_logs = relationship("ChatToolCall", back_populates="message", cascade="all, delete-orphan")
