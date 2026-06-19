from ..models.family import Family
from ..models.invites import Invite, InviteType
from ..models.user import User
from .date_utils import datetime_to_iso


def serialize_basic_user(user: User | None, include_family_id: bool = False) -> dict | None:
    if not user:
        return None

    serialized = {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
    }

    if include_family_id:
        serialized["family_id"] = user.family_id

    return serialized


def serialize_auth_user(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "has_email_permissions": user.has_email_permissions,
        "has_sheets_permissions": user.has_sheets_permissions,
        "is_setup_completed": user.is_setup_completed,
        "spreadsheet_id": user.spreadsheet_id,
        "last_synced_at": datetime_to_iso(user.last_synced_at),
        "last_synced_status": user.last_synced_status,
        "last_synced_email_date": datetime_to_iso(user.last_synced_email_date),
        "sync_status": user.sync_status,
    }


def serialize_family(family: Family | None) -> dict | None:
    if not family:
        return None

    return {
        "id": family.id,
        "name": family.name,
        "owner_user_id": family.owner_user_id,
    }


def serialize_family_member(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "spreadsheet_id": user.spreadsheet_id,
        "is_owner": user.family and user.family.owner_user_id == user.id,
    }


def serialize_invite(invite: Invite) -> dict:
    invite_type = invite.invite_type or InviteType.FAMILY_INVITE.value
    impacted_user = (
        invite.invited_user
        if invite_type == InviteType.FAMILY_INVITE.value
        else invite.invited_by
    )
    requires_family_change = bool(
        impacted_user
        and impacted_user.family_id
        and impacted_user.family_id != invite.family_id
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
        "invited_by": serialize_basic_user(invite.invited_by, include_family_id=True),
        "invited_user": serialize_basic_user(invite.invited_user, include_family_id=True),
    }
