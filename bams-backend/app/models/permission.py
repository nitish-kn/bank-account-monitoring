from sqlalchemy import Column, DateTime, String, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..database import Base
from .types import ID_TYPE


class Permission(Base):
    """One entry in the fixed, global (module, action) catalog -- e.g.
    ("accounts", "create"), ("sync", "trigger"). Seeded once; orgs pick from
    this list when building a role, they never add rows here themselves."""

    __tablename__ = "permissions"
    __table_args__ = (
        UniqueConstraint("module", "action", name="uq_permissions_module_action"),
    )

    id = Column(ID_TYPE, primary_key=True)
    module = Column(String, nullable=False, index=True)
    action = Column(String, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    roles = relationship("Role", secondary="role_permissions", back_populates="permissions")
