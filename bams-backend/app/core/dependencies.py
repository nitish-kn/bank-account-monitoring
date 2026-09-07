from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.organization import Organization
from ..models.permission import Permission
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


def _holds_permission(held: set[str], db: Session, module: str, action: str) -> bool:
    """Whether `held` satisfies `module.action`.

    Create/update/delete also require `module.view`, but only for modules
    that actually define one (accounts/users/roles) -- someone who can't see
    a resource shouldn't be able to change it either. Modules with a single
    action and no paired view (sync_data.trigger, transactions.update, etc.)
    have nothing to require, so this is a no-op for them.
    """
    if f"{module}.{action}" not in held:
        return False
    also_required = f"{module}.view" if action != "view" else None
    if also_required and also_required not in held:
        view_defined = db.query(Permission.id).filter(
            Permission.module == module, Permission.action == "view"
        ).first()
        if view_defined:
            return False
    return True


def require_permission(module: str, action: str):
    """Route dependency asserting the caller holds `module.action`."""

    def dependency(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        held = get_user_permissions(db, current_user)
        if not _holds_permission(held, db, module, action):
            raise HTTPException(status_code=403, detail=f"You don't have permission to {action} {module}.")
        return current_user

    return dependency


def require_any_permission(*requirements: tuple[str, str]):
    """Route dependency asserting the caller holds at least one of the given
    `(module, action)` permissions -- for an action two different pages both
    trigger through the same endpoint (e.g. editing a transaction from the
    main table vs. from Needs Review), so either one being granted is
    enough, without forcing every caller to also hold the other."""

    def dependency(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        held = get_user_permissions(db, current_user)
        if any(_holds_permission(held, db, module, action) for module, action in requirements):
            return current_user
        raise HTTPException(status_code=403, detail="You don't have permission to perform this action.")

    return dependency
