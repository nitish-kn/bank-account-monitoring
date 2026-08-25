from typing import Optional

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.dependencies import require_permission
from ..database import get_db
from ..models.permission import Permission
from ..models.users import User
from ..services import rbac_service
from ..utils.serializers import serialize_permission, serialize_role

router = APIRouter(prefix="/api/roles", tags=["roles"])


class RoleRequest(BaseModel):
    name: str
    description: Optional[str] = None


class UpdateRoleRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class SetPermissionsRequest(BaseModel):
    permission_ids: list[int]


@router.get("")
def list_roles(
    actor: User = Depends(require_permission("roles", "view")),
    db: Session = Depends(get_db),
):
    """Roles plus the permission catalog -- the matrix UI needs both, and it
    always renders them together."""
    permissions = db.query(Permission).order_by(Permission.module, Permission.action).all()
    return {
        "roles": [serialize_role(r) for r in rbac_service.list_roles(db, actor.org_id)],
        "permissions": [serialize_permission(p) for p in permissions],
    }


@router.post("")
def create_role(
    req: RoleRequest,
    actor: User = Depends(require_permission("roles", "create")),
    db: Session = Depends(get_db),
):
    return serialize_role(rbac_service.create_role(db, actor.org_id, req.name, req.description))


@router.put("/{role_id}")
def update_role(
    role_id: int,
    req: UpdateRoleRequest,
    actor: User = Depends(require_permission("roles", "update")),
    db: Session = Depends(get_db),
):
    return serialize_role(rbac_service.update_role(db, actor.org_id, role_id, req.name, req.description))


@router.put("/{role_id}/permissions")
def set_role_permissions(
    role_id: int,
    req: SetPermissionsRequest,
    actor: User = Depends(require_permission("roles", "update")),
    db: Session = Depends(get_db),
):
    return serialize_role(rbac_service.set_role_permissions(db, actor.org_id, role_id, req.permission_ids))


@router.delete("/{role_id}", status_code=204)
def delete_role(
    role_id: int,
    actor: User = Depends(require_permission("roles", "delete")),
    db: Session = Depends(get_db),
):
    rbac_service.delete_role(db, actor.org_id, role_id)
    return Response(status_code=204)
