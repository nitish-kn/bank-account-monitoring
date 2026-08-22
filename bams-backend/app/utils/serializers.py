from ..models.family import Family
from ..models.invites import Invite, InviteType
from ..models.organization import Organization
from .date_utils import datetime_to_iso


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
