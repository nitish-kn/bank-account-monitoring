from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.organization import Organization
from ..models.users import User
from ..services.rbac_service import get_user_permissions
from .auth import verify_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# JWT `sub` used to hold an organization id and now holds a user id. Tokens
# are stamped with this claim so a pre-RBAC token can't be mistaken for a
# user token and silently resolve to whichever user happens to share that id.
TOKEN_TYPE = "user"


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = verify_token(token)
    if payload is None or payload.get("typ") != TOKEN_TYPE:
        raise credentials_exception

    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None or not user.is_active:
        raise credentials_exception
    return user


def get_current_org(current_user: User = Depends(get_current_user)) -> Organization:
    """The org the signed-in user belongs to. Routes that only care about
    tenancy keep depending on this and are unaffected by users existing."""
    if current_user.organization is None:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    return current_user.organization


def require_permission(module: str, action: str):
    """Route dependency asserting the caller holds `module.action`.

    Create/update/delete also require `module.view` -- someone who can't see
    a resource shouldn't be able to change it either, even if their role was
    (mis)configured with the write permission alone.
    """
    required = f"{module}.{action}"
    also_required = f"{module}.view" if action != "view" else None

    def dependency(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        held = get_user_permissions(db, current_user)
        if required not in held or (also_required and also_required not in held):
            raise HTTPException(status_code=403, detail=f"You don't have permission to {action} {module}.")
        return current_user

    return dependency
