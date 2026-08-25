from sqlalchemy import Column, DateTime, ForeignKey
from sqlalchemy.sql import func

from ..database import Base
from .types import ID_TYPE


class RolePermission(Base):
    """Join table: which permissions a role grants."""

    __tablename__ = "role_permissions"

    role_id = Column(ID_TYPE, ForeignKey("roles.id"), primary_key=True)
    permission_id = Column(ID_TYPE, ForeignKey("permissions.id"), primary_key=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
