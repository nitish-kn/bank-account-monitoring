from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..models.family import Family
from ..models.invites import Invite
from ..models.organization import Organization
from ..core.constants import (
    FAMILY_INVITE,
    INVITE_STATUS_ACCEPTED,
    INVITE_STATUS_DECLINED,
    INVITE_STATUS_EXPIRED,
    INVITE_STATUS_PENDING,
    JOIN_REQUEST,
)
from ..utils.date_utils import utc_now
from ..utils.email_utils import normalize_emails
from ..utils.family_utils import ensure_family, move_org_to_family
from ..utils.serializers import serialize_invite


def _get_accessible_pending_invite(invite_id: int, current_org: Organization, db: Session) -> Invite:
    invite = (
        db.query(Invite)
        .filter(
            Invite.id == invite_id,
            Invite.status == INVITE_STATUS_PENDING,
            or_(
                Invite.invited_org_id == current_org.id,
                Invite.invited_email == current_org.email.lower(),
            ),
        )
        .first()
    )

    if not invite:
        raise HTTPException(status_code=404, detail="Pending invite not found")

    if invite.expires_at and invite.expires_at < utc_now():
        invite.status = INVITE_STATUS_EXPIRED
        db.add(invite)
        db.commit()
        raise HTTPException(status_code=400, detail="Invite has expired")

    return invite


def create_invites_for_org(emails: list[str], current_org: Organization, db: Session) -> dict:
    invited_emails = normalize_emails(emails)

    if not invited_emails:
        raise HTTPException(status_code=400, detail="At least one email is required")

    orgs_by_email = {
        org.email.lower(): org
        for org in db.query(Organization).filter(Organization.email.in_(invited_emails)).all()
    }

    warnings = {
        "orgs_not_found": [],
        "self_invites": [],
        "already_family_members": [],
        "already_pending": [],
        "join_requests": [],
        "receiver_will_leave_family": [],
    }
    invite_specs: list[dict] = []

    for email in invited_emails:
        invited_org = orgs_by_email.get(email)

        if not invited_org:
            warnings["orgs_not_found"].append(email)
            continue

        if invited_org.id == current_org.id:
            warnings["self_invites"].append(email)
            continue

        if current_org.family_id and invited_org.family_id == current_org.family_id:
            warnings["already_family_members"].append(email)
            continue

        if not invited_org.family_id:
            family = ensure_family(current_org, db)
            invite_type = FAMILY_INVITE
            target_family_id = family.id
            notice_key = None
        elif not current_org.family_id:
            invite_type = JOIN_REQUEST
            target_family_id = invited_org.family_id
            notice_key = "join_requests"
        else:
            invite_type = FAMILY_INVITE
            target_family_id = current_org.family_id
            notice_key = "receiver_will_leave_family"

        invite_specs.append({
            "invited_org": invited_org,
            "invite_type": invite_type,
            "target_family_id": target_family_id,
            "notice_key": notice_key,
        })

    if not invite_specs:
        return {
            "message": "No invites were created.",
            "invites": [],
            "warnings": warnings,
        }

    created_invites: list[Invite] = []

    for invite_spec in invite_specs:
        invited_org = invite_spec["invited_org"]
        invite_type = invite_spec["invite_type"]
        target_family_id = invite_spec["target_family_id"]
        notice_key = invite_spec["notice_key"]

        pending_query = db.query(Invite).filter(
            Invite.family_id == target_family_id,
            Invite.status == INVITE_STATUS_PENDING,
            Invite.invite_type == invite_type,
        )

        if invite_type == FAMILY_INVITE:
            pending_query = pending_query.filter(Invite.invited_org_id == invited_org.id)
        else:
            pending_query = pending_query.filter(Invite.invited_by_org_id == current_org.id)

        pending_invite = pending_query.first()

        if pending_invite:
            warnings["already_pending"].append(invited_org.email.lower())
            continue

        invite = Invite(
            family_id=target_family_id,
            invited_by_org_id=current_org.id,
            invited_org_id=invited_org.id,
            invited_email=invited_org.email.lower(),
            invite_type=invite_type,
            status=INVITE_STATUS_PENDING,
        )
        db.add(invite)
        created_invites.append(invite)

        if notice_key:
            warnings[notice_key].append(invited_org.email.lower())

    if not created_invites:
        return {
            "message": "No invites were created.",
            "invites": [],
            "warnings": warnings,
        }

    db.commit()

    for invite in created_invites:
        db.refresh(invite)

    return {
        "message": "Invites processed successfully.",
        "invites": [serialize_invite(invite) for invite in created_invites],
        "warnings": warnings,
    }


def get_pending_invites_for_org(current_org: Organization, db: Session) -> dict:
    invites = (
        db.query(Invite)
        .filter(
            Invite.status == INVITE_STATUS_PENDING,
            or_(
                Invite.invited_org_id == current_org.id,
                Invite.invited_email == current_org.email.lower(),
            ),
        )
        .order_by(Invite.created_at.desc())
        .all()
    )

    return {
        "invites": [serialize_invite(invite) for invite in invites],
    }


def get_sent_invites_for_org(current_org: Organization, db: Session) -> dict:
    invites = (
        db.query(Invite)
        .filter(Invite.invited_by_org_id == current_org.id)
        .order_by(Invite.created_at.desc())
        .all()
    )

    return {
        "invites": [serialize_invite(invite) for invite in invites],
    }


def accept_invite_for_org(invite_id: int, current_org: Organization, db: Session) -> dict:
    invite = _get_accessible_pending_invite(invite_id, current_org, db)
    invite_type = invite.invite_type or FAMILY_INVITE

    target_family = db.query(Family).filter(Family.id == invite.family_id).first()
    if not target_family:
        raise HTTPException(status_code=400, detail="Invite target family no longer exists")

    if invite_type == FAMILY_INVITE:
        inviter = invite.invited_by
        if not inviter or inviter.family_id != invite.family_id:
            raise HTTPException(
                status_code=400,
                detail="This invite is no longer valid because the sender is not in that family.",
            )
        move_org_to_family(current_org, invite.family_id, db)
    elif invite_type == JOIN_REQUEST:
        requester = invite.invited_by
        if not requester:
            raise HTTPException(status_code=400, detail="Invite requester no longer exists")
        if current_org.family_id != invite.family_id:
            raise HTTPException(
                status_code=400,
                detail="You can no longer approve this request because you are not in that family.",
            )
        move_org_to_family(requester, invite.family_id, db)
    else:
        raise HTTPException(status_code=400, detail="Unsupported invite type")

    invite.invited_org_id = current_org.id
    invite.status = INVITE_STATUS_ACCEPTED
    invite.accepted_at = utc_now()

    db.add(invite)
    db.commit()
    db.refresh(invite)

    return {
        "message": "Invite accepted successfully.",
        "invite": serialize_invite(invite),
    }


def decline_invite_for_org(invite_id: int, current_org: Organization, db: Session) -> dict:
    invite = _get_accessible_pending_invite(invite_id, current_org, db)

    invite.invited_org_id = current_org.id
    invite.status = INVITE_STATUS_DECLINED
    invite.declined_at = utc_now()

    db.add(invite)
    db.commit()
    db.refresh(invite)

    return {
        "message": "Invite declined successfully.",
        "invite": serialize_invite(invite),
    }
