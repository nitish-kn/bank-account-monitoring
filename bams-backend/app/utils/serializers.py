from ..models.family import Family
from ..models.invites import Invite, InviteType
from ..models.organization import Organization
from ..models.permission import Permission
from ..models.roles import Role
from ..models.users import User
from .date_utils import datetime_to_iso


def serialize_permission(permission: Permission) -> dict:
    return {
        "id": permission.id,
        "module": permission.module,
        "action": permission.action,
        "key": f"{permission.module}.{permission.action}",
        "name": permission.name,
        "description": permission.description,
    }


def serialize_role(role: Role) -> dict:
    return {
        "id": role.id,
        "name": role.name,
        "description": role.description,
        "is_system": role.is_system,
        # Super Admin implicitly holds everything, so its stored rows aren't
        # the source of truth -- the UI renders it as all-granted regardless.
        "permission_ids": [] if role.is_system else [p.id for p in role.permissions],
        "user_count": len(role.users),
    }


def serialize_role_option(role: Role) -> dict:
    """Just enough to populate a role picker. Managing users doesn't imply
    permission to see what each role actually grants, so this deliberately
    omits the permission set that serialize_role exposes."""
    return {"id": role.id, "name": role.name, "is_system": role.is_system}


def serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "is_active": user.is_active,
        "is_owner": bool(user.role and user.role.is_system),
        "role_id": user.role_id,
        "role_name": user.role.name if user.role else None,
        "last_login_at": datetime_to_iso(user.last_login_at),
        "created_at": datetime_to_iso(user.created_at),
    }


def serialize_basic_org(org: Organization | None, include_family_id: bool = False) -> dict | None:
    if not org:
        return None

    serialized = {
        "id": org.id,
        "email": org.email,
        "name": org.name,
        "picture": org.picture,
    }

    if include_family_id:
        serialized["family_id"] = org.family_id

    return serialized


def serialize_auth_org(org: Organization) -> dict:
    return {
        "id": org.id,
        "email": org.email,
        "name": org.name,
        "picture": org.picture,
        "has_email_permissions": org.has_email_permissions,
        "has_sheets_permissions": org.has_sheets_permissions,
        "is_setup_completed": org.is_setup_completed,
        "spreadsheet_id": org.spreadsheet_id,
        "last_synced_at": datetime_to_iso(org.last_synced_at),
        "last_synced_status": org.last_synced_status,
        "last_synced_email_date": datetime_to_iso(org.last_synced_email_date),
        "sync_status": org.sync_status,
    }


def serialize_family(family: Family | None) -> dict | None:
    if not family:
        return None

    return {
        "id": family.id,
        "name": family.name,
        "owner_org_id": family.owner_org_id,
    }


def serialize_family_member(org: Organization) -> dict:
    return {
        "id": org.id,
        "email": org.email,
        "name": org.name,
        "picture": org.picture,
        "spreadsheet_id": org.spreadsheet_id,
        "is_owner": org.family and org.family.owner_org_id == org.id,
    }


def serialize_invite(invite: Invite) -> dict:
    invite_type = invite.invite_type or InviteType.FAMILY_INVITE.value
    impacted_org = (
        invite.invited_org
        if invite_type == InviteType.FAMILY_INVITE.value
        else invite.invited_by
    )
    requires_family_change = bool(
        impacted_org
        and impacted_org.family_id
        and impacted_org.family_id != invite.family_id
    )

    return {
        "id": invite.id,
        "family_id": invite.family_id,
        "invited_email": invite.invited_email,
        "invite_type": invite_type,
        "status": invite.status,
        "requires_family_change": requires_family_change,
        "created_at": datetime_to_iso(invite.created_at),
        "expires_at": datetime_to_iso(invite.expires_at),
        "accepted_at": datetime_to_iso(invite.accepted_at),
        "declined_at": datetime_to_iso(invite.declined_at),
        "family": serialize_family(invite.family),
        "invited_by": serialize_basic_org(invite.invited_by, include_family_id=True),
        "invited_org": serialize_basic_org(invite.invited_org, include_family_id=True),
    }
