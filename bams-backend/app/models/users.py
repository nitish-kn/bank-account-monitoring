from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..database import Base
from .types import ID_TYPE


class User(Base):
    """An individual, login-capable person inside an Organization. The org's
    Google-signup owner gets one of these too (password_hash stays null for
    them -- they always authenticate through Google); every other row here
    is a sub-user an admin created directly with a password.

    Each user holds exactly one role, by design (not a join table) -- a
    user is never mid-transition between roles, so there's nothing a
    many-to-many would represent that this doesn't. role_id is NOT NULL:
    a user always has a role from the moment it's created (the org's own
    super_admin role for the signup owner, whatever the admin picks for
    everyone after)."""

    __tablename__ = "users"

    id = Column(ID_TYPE, primary_key=True)
    org_id = Column(ID_TYPE, ForeignKey("organizations.id"), nullable=False, index=True)
    role_id = Column(ID_TYPE, ForeignKey("roles.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False, server_default="true")
    created_by_user_id = Column(ID_TYPE, ForeignKey("users.id"), nullable=True)
    role_assigned_by_user_id = Column(ID_TYPE, ForeignKey("users.id"), nullable=True)
    role_assigned_at = Column(DateTime(timezone=True), nullable=True, server_default=func.now())
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    organization = relationship("Organization", foreign_keys=[org_id], back_populates="users")
    role = relationship("Role", foreign_keys=[role_id], back_populates="users")
    created_by = relationship("User", remote_side=[id], foreign_keys=[created_by_user_id])
    role_assigned_by = relationship("User", remote_side=[id], foreign_keys=[role_assigned_by_user_id])
