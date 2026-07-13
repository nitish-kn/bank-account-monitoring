from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..database import Base
from .types import ID_TYPE


class Family(Base):
    __tablename__ = "families"

    id = Column(ID_TYPE, primary_key=True)
    name = Column(String, nullable=True)
    owner_user_id = Column(ID_TYPE, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    owner = relationship("User", foreign_keys=[owner_user_id])
    members = relationship("User", foreign_keys="User.family_id", back_populates="family")
    invites = relationship("Invite", back_populates="family")
