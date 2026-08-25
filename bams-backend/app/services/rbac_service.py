"""Role/permission resolution and the org's built-in super_admin provisioning."""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..core.security import decrypt_password, encrypt_password, hash_password
from ..models.organization import Organization
from ..models.permission import Permission
from ..models.role_permission import RolePermission
from ..models.roles import Role
from ..models.users import User

SUPER_ADMIN_ROLE_NAME = "Super Admin"
SUPER_ADMIN_ROLE_DESCRIPTION = "Full access to everything in this organization."


def get_user_permissions(db: Session, user: User) -> set[str]:
    """Permission keys ("module.action") this user holds.

    The super_admin role short-circuits to the entire catalog rather than
    reading role_permissions, so a permission added later applies to every
    org's super_admin immediately, with no re-seeding.
    """
    query = db.query(Permission.module, Permission.action)
    if not (user.role and user.role.is_system):
        query = query.join(RolePermission, RolePermission.permission_id == Permission.id).filter(
            RolePermission.role_id == user.role_id
        )
    return {f"{module}.{action}" for module, action in query.all()}


def ensure_super_admin(db: Session, org: Organization) -> User:
    """Give an org its super_admin role and the matching user for its Google
    identity. Safe to call repeatedly -- used both at signup and by the
    backfill script. Does not commit; the caller owns the transaction.
    """
    role = db.query(Role).filter(Role.org_id == org.id, Role.is_system.is_(True)).first()
    if role is None:
        role = Role(
            org_id=org.id,
            name=SUPER_ADMIN_ROLE_NAME,
            description=SUPER_ADMIN_ROLE_DESCRIPTION,
            is_system=True,
        )
        db.add(role)
        db.flush()  # need role.id for the RolePermission rows below

    granted = {
        row.permission_id
        for row in db.query(RolePermission).filter(RolePermission.role_id == role.id)
    }
    for permission in db.query(Permission).all():
        if permission.id not in granted:
            db.add(RolePermission(role_id=role.id, permission_id=permission.id))

    user = db.query(User).filter(User.email == org.email).first()
    if user is None:
        user = User(
            org_id=org.id,
            role_id=role.id,
            name=org.name or org.email,
            email=org.email,
            password_hash=None,  # signs in through Google, never with a password
        )
        db.add(user)
        db.flush()
    elif user.org_id != org.id:
        # Emails are globally unique, so this address already identifies
        # somebody in another org -- e.g. an admin there created a sub-user
        # with it. Returning that user would sign this Google account into
        # the wrong organization, so refuse instead.
        raise HTTPException(
            status_code=409,
            detail="This email is already registered to another organization.",
        )
    elif user.role_id != role.id:
        user.role_id = role.id

    return user


# --------------------------------------------------------------------------
# Roles
# --------------------------------------------------------------------------
def list_roles(db: Session, org_id: int) -> list[Role]:
    return db.query(Role).filter(Role.org_id == org_id).order_by(Role.is_system.desc(), Role.name).all()


def _get_role(db: Session, org_id: int, role_id: int) -> Role:
    role = db.query(Role).filter(Role.id == role_id, Role.org_id == org_id).first()
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found.")
    return role


def _assert_unique_role_name(db: Session, org_id: int, name: str, exclude_id: int | None = None):
    query = db.query(Role).filter(Role.org_id == org_id, Role.name == name)
    if exclude_id is not None:
        query = query.filter(Role.id != exclude_id)
    if query.first():
        raise HTTPException(status_code=400, detail=f"A role named '{name}' already exists.")


def create_role(db: Session, org_id: int, name: str, description: str | None) -> Role:
    _assert_unique_role_name(db, org_id, name)
    role = Role(org_id=org_id, name=name, description=description)
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


def update_role(db: Session, org_id: int, role_id: int, name: str | None, description: str | None) -> Role:
    role = _get_role(db, org_id, role_id)
    if role.is_system:
        raise HTTPException(status_code=400, detail="The Super Admin role can't be edited.")
    if name and name != role.name:
        _assert_unique_role_name(db, org_id, name, exclude_id=role_id)
        role.name = name
    if description is not None:
        role.description = description
    db.commit()
    db.refresh(role)
    return role


def delete_role(db: Session, org_id: int, role_id: int) -> None:
    role = _get_role(db, org_id, role_id)
    if role.is_system:
        raise HTTPException(status_code=400, detail="The Super Admin role can't be deleted.")
    if db.query(User).filter(User.role_id == role.id).count():
        raise HTTPException(
            status_code=400,
            detail="This role is still assigned to users. Move them to another role first.",
        )
    db.delete(role)
    db.commit()


def set_role_permissions(db: Session, org_id: int, role_id: int, permission_ids: list[int]) -> Role:
    """Replace a role's permission set with exactly `permission_ids`."""
    role = _get_role(db, org_id, role_id)
    if role.is_system:
        raise HTTPException(status_code=400, detail="The Super Admin role always has every permission.")

    catalog = {row.id: (row.module, row.action) for row in db.query(Permission)}
    unknown = set(permission_ids) - catalog.keys()
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown permission ids: {sorted(unknown)}")

    # A module's create/update/delete only make sense alongside its view --
    # granting the write action without it is a role misconfiguration, not a
    # narrower permission.
    granted = {catalog[pid] for pid in permission_ids}
    modules_needing_view = {module for module, action in granted if action != "view"}
    missing_view = [
        module for module in modules_needing_view if (module, "view") not in granted and (module, "view") in catalog.values()
    ]
    if missing_view:
        raise HTTPException(
            status_code=400,
            detail=f"Grant view access before other actions for: {', '.join(sorted(missing_view))}.",
        )

    db.query(RolePermission).filter(RolePermission.role_id == role.id).delete(synchronize_session=False)
    for permission_id in set(permission_ids):
        db.add(RolePermission(role_id=role.id, permission_id=permission_id))
    db.commit()
    db.refresh(role)
    return role


# --------------------------------------------------------------------------
# Users
# --------------------------------------------------------------------------
def list_users(db: Session, org_id: int) -> list[User]:
    return db.query(User).filter(User.org_id == org_id).order_by(User.created_at).all()


def _get_user(db: Session, org_id: int, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id, User.org_id == org_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


def create_user(db: Session, org_id: int, actor: User, name: str, email: str, password: str, role_id: int) -> User:
    email = email.strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="A user with this email already exists.")

    _get_role(db, org_id, role_id)  # 404s if the role isn't this org's
    user = User(
        org_id=org_id,
        role_id=role_id,
        name=name,
        email=email,
        password_hash=hash_password(password),
        password_encrypted=encrypt_password(password),
        created_by_user_id=actor.id,
        role_assigned_by_user_id=actor.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, org_id: int, actor: User, user_id: int, **fields) -> User:
    user = _get_user(db, org_id, user_id)

    name = fields.get("name")
    if name:
        user.name = name

    role_id = fields.get("role_id")
    if role_id and role_id != user.role_id:
        if user.role and user.role.is_system:
            raise HTTPException(status_code=400, detail="The organization owner's role can't be changed.")
        _get_role(db, org_id, role_id)
        user.role_id = role_id
        user.role_assigned_by_user_id = actor.id

    password = fields.get("password")
    if password:
        user.password_hash = hash_password(password)
        user.password_encrypted = encrypt_password(password)

    is_active = fields.get("is_active")
    if is_active is not None:
        if user.role and user.role.is_system and not is_active:
            raise HTTPException(status_code=400, detail="The organization owner can't be deactivated.")
        user.is_active = is_active

    db.commit()
    db.refresh(user)
    return user


def reveal_password(db: Session, org_id: int, user_id: int) -> str:
    user = _get_user(db, org_id, user_id)
    if user.role and user.role.is_system:
        raise HTTPException(status_code=400, detail="The organization owner signs in with Google and has no password.")
    password = decrypt_password(user.password_encrypted)
    if password is None:
        raise HTTPException(status_code=404, detail="No password on file for this user.")
    return password


def delete_user(db: Session, org_id: int, actor: User, user_id: int) -> None:
    user = _get_user(db, org_id, user_id)
    if user.id == actor.id:
        raise HTTPException(status_code=400, detail="You can't remove your own account.")
    if user.role and user.role.is_system:
        raise HTTPException(status_code=400, detail="The organization owner can't be removed.")
    db.delete(user)
    db.commit()
