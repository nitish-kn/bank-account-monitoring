from sqlalchemy import Column, ForeignKey, String, DateTime, Boolean, Integer
from ..database import Base
from .types import ID_TYPE
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func


class ChatToolCall(Base):
    __tablename__ = "chat_tool_calls"

    id = Column(String, primary_key=True)
    message_id = Column(String, ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(String, ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(ID_TYPE, ForeignKey("users.id"), nullable=False, index=True)

    tool_name = Column(String, nullable=False)
    arguments = Column(JSONB, nullable=True)
    result = Column(JSONB, nullable=True)
    cache_hit = Column(Boolean, nullable=False, default=False, server_default="false")
    latency_ms = Column(Integer, nullable=True)
    error = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    message = relationship("ChatMessage", back_populates="tool_call_logs")
