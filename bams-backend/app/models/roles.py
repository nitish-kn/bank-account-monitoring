from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..database import Base
from .types import ID_TYPE


class Role(Base):
    """A named bundle of permissions, scoped to one org. Every org gets its
    own 'super_admin' row auto-created at signup (is_system=True, every
    permission attached); any other role is whatever that org's admins build."""

    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("org_id", "name", name="uq_roles_org_name"),
    )

    id = Column(ID_TYPE, primary_key=True)
    org_id = Column(ID_TYPE, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    is_system = Column(Boolean, default=False, nullable=False, server_default="false")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    organization = relationship("Organization", back_populates="roles")
    # users.role_id is a direct FK (one role -> many users), not a join table
    # -- see the docstring on User for why. Users.role_id has two other
    # self-referential FKs to users.id (created_by/role_assigned_by), so
    # foreign_keys is spelled out to keep this join unambiguous.
    users = relationship("User", foreign_keys="User.role_id", back_populates="role")
    permissions = relationship("Permission", secondary="role_permissions", back_populates="roles")
