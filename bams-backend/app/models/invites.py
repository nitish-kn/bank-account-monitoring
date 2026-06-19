from enum import Enum

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..database import Base


class InviteType(str, Enum):
    FAMILY_INVITE = "family_invite"
    JOIN_REQUEST = "join_request"


class Invite(Base):
    __tablename__ = "invites"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id"), nullable=False, index=True)
    invited_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    invited_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    invited_email = Column(String, nullable=False, index=True)
    invite_type = Column(
        String,
        default=InviteType.FAMILY_INVITE.value,
        nullable=False,
        server_default=InviteType.FAMILY_INVITE.value,
        index=True,
    )
    status = Column(String, default="pending", nullable=False, server_default="pending", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    declined_at = Column(DateTime(timezone=True), nullable=True)

    family = relationship("Family", back_populates="invites")
    invited_by = relationship("User", foreign_keys=[invited_by_user_id])
    invited_user = relationship("User", foreign_keys=[invited_user_id])
