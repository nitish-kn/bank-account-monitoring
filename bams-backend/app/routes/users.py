from typing import Optional

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.dependencies import require_permission
from ..database import get_db
from ..models.users import User
from ..services import rbac_service
from ..utils.serializers import serialize_role_option, serialize_user

router = APIRouter(prefix="/api/users", tags=["users"])


class CreateUserRequest(BaseModel):
    name: str
    email: str
    password: str
    role_id: int


class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    role_id: Optional[int] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("")
def list_users(
    actor: User = Depends(require_permission("users", "view")),
    db: Session = Depends(get_db),
):
    """Users plus this org's roles. Managing users requires being able to
    assign a role, so the picker's options ship with the list rather than
    forcing a second call to /roles that needs roles.view."""
    return {
        "users": [serialize_user(u) for u in rbac_service.list_users(db, actor.org_id)],
        "roles": [serialize_role_option(r) for r in rbac_service.list_roles(db, actor.org_id)],
    }


@router.post("")
def create_user(
    req: CreateUserRequest,
    actor: User = Depends(require_permission("users", "create")),
    db: Session = Depends(get_db),
):
    user = rbac_service.create_user(db, actor.org_id, actor, req.name, req.email, req.password, req.role_id)
    return serialize_user(user)


@router.get("/{user_id}/password")
def reveal_password(
    user_id: int,
    actor: User = Depends(require_permission("users", "update")),
    db: Session = Depends(get_db),
):
    return {"password": rbac_service.reveal_password(db, actor.org_id, user_id)}


@router.put("/{user_id}")
def update_user(
    user_id: int,
    req: UpdateUserRequest,
    actor: User = Depends(require_permission("users", "update")),
    db: Session = Depends(get_db),
):
    user = rbac_service.update_user(db, actor.org_id, actor, user_id, **req.dict(exclude_unset=True))
    return serialize_user(user)


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    actor: User = Depends(require_permission("users", "delete")),
    db: Session = Depends(get_db),
):
    rbac_service.delete_user(db, actor.org_id, actor, user_id)
    return Response(status_code=204)
