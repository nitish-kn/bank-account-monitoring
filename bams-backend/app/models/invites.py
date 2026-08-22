from enum import Enum

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..core.constants import (
    FAMILY_INVITE as FAMILY_INVITE_VALUE,
    INVITE_STATUS_PENDING,
    JOIN_REQUEST as JOIN_REQUEST_VALUE,
)
from ..database import Base
from .types import ID_TYPE


class InviteType(str, Enum):
    FAMILY_INVITE = FAMILY_INVITE_VALUE
    JOIN_REQUEST = JOIN_REQUEST_VALUE


class Invite(Base):
    __tablename__ = "invites"

    id = Column(ID_TYPE, primary_key=True)
    family_id = Column(ID_TYPE, ForeignKey("families.id"), nullable=False, index=True)
    invited_by_org_id = Column(ID_TYPE, ForeignKey("organizations.id"), nullable=False, index=True)
    invited_org_id = Column(ID_TYPE, ForeignKey("organizations.id"), nullable=True, index=True)
    invited_email = Column(String, nullable=False, index=True)
    invite_type = Column(
        String,
        default=InviteType.FAMILY_INVITE.value,
        nullable=False,
        server_default=InviteType.FAMILY_INVITE.value,
        index=True,
    )
    status = Column(String, default=INVITE_STATUS_PENDING, nullable=False, server_default=INVITE_STATUS_PENDING, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    declined_at = Column(DateTime(timezone=True), nullable=True)

    family = relationship("Family", back_populates="invites")
    invited_by = relationship("Organization", foreign_keys=[invited_by_org_id])
    invited_org = relationship("Organization", foreign_keys=[invited_org_id])
