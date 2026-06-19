from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..models.family import Family
from ..models.invites import Invite, InviteType
from ..models.user import User
from ..utils.date_utils import utc_now
from ..utils.email_utils import normalize_emails
from ..utils.family_utils import ensure_family, move_user_to_family
from ..utils.serializers import serialize_invite


FAMILY_INVITE = InviteType.FAMILY_INVITE.value
JOIN_REQUEST = InviteType.JOIN_REQUEST.value


def _get_accessible_pending_invite(invite_id: int, current_user: User, db: Session) -> Invite:
    invite = (
        db.query(Invite)
        .filter(
            Invite.id == invite_id,
            Invite.status == "pending",
            or_(
                Invite.invited_user_id == current_user.id,
                Invite.invited_email == current_user.email.lower(),
            ),
        )
        .first()
    )

    if not invite:
        raise HTTPException(status_code=404, detail="Pending invite not found")

    if invite.expires_at and invite.expires_at < utc_now():
        invite.status = "expired"
        db.add(invite)
        db.commit()
        raise HTTPException(status_code=400, detail="Invite has expired")

    return invite


def create_invites_for_user(emails: list[str], current_user: User, db: Session) -> dict:
    invited_emails = normalize_emails(emails)

    if not invited_emails:
        raise HTTPException(status_code=400, detail="At least one email is required")

    users_by_email = {
        user.email.lower(): user
        for user in db.query(User).filter(User.email.in_(invited_emails)).all()
    }

    warnings = {
        "users_not_found": [],
        "self_invites": [],
        "already_family_members": [],
        "already_pending": [],
        "join_requests": [],
        "receiver_will_leave_family": [],
    }
    invite_specs: list[dict] = []

    for email in invited_emails:
        invited_user = users_by_email.get(email)

        if not invited_user:
            warnings["users_not_found"].append(email)
            continue

        if invited_user.id == current_user.id:
            warnings["self_invites"].append(email)
            continue

        if current_user.family_id and invited_user.family_id == current_user.family_id:
            warnings["already_family_members"].append(email)
            continue

        if not invited_user.family_id:
            family = ensure_family(current_user, db)
            invite_type = FAMILY_INVITE
            target_family_id = family.id
            notice_key = None
        elif not current_user.family_id:
            invite_type = JOIN_REQUEST
            target_family_id = invited_user.family_id
            notice_key = "join_requests"
        else:
            invite_type = FAMILY_INVITE
            target_family_id = current_user.family_id
            notice_key = "receiver_will_leave_family"

        invite_specs.append({
            "invited_user": invited_user,
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
        invited_user = invite_spec["invited_user"]
        invite_type = invite_spec["invite_type"]
        target_family_id = invite_spec["target_family_id"]
        notice_key = invite_spec["notice_key"]

        pending_query = db.query(Invite).filter(
            Invite.family_id == target_family_id,
            Invite.status == "pending",
            Invite.invite_type == invite_type,
        )

        if invite_type == FAMILY_INVITE:
            pending_query = pending_query.filter(Invite.invited_user_id == invited_user.id)
        else:
            pending_query = pending_query.filter(Invite.invited_by_user_id == current_user.id)

        pending_invite = pending_query.first()

        if pending_invite:
            warnings["already_pending"].append(invited_user.email.lower())
            continue

        invite = Invite(
            family_id=target_family_id,
            invited_by_user_id=current_user.id,
            invited_user_id=invited_user.id,
            invited_email=invited_user.email.lower(),
            invite_type=invite_type,
            status="pending",
        )
        db.add(invite)
        created_invites.append(invite)

        if notice_key:
            warnings[notice_key].append(invited_user.email.lower())

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


def get_pending_invites_for_user(current_user: User, db: Session) -> dict:
    invites = (
        db.query(Invite)
        .filter(
            Invite.status == "pending",
            or_(
                Invite.invited_user_id == current_user.id,
                Invite.invited_email == current_user.email.lower(),
            ),
        )
        .order_by(Invite.created_at.desc())
        .all()
    )

    return {
        "invites": [serialize_invite(invite) for invite in invites],
    }


def get_sent_invites_for_user(current_user: User, db: Session) -> dict:
    invites = (
        db.query(Invite)
        .filter(Invite.invited_by_user_id == current_user.id)
        .order_by(Invite.created_at.desc())
        .all()
    )

    return {
        "invites": [serialize_invite(invite) for invite in invites],
    }


def accept_invite_for_user(invite_id: int, current_user: User, db: Session) -> dict:
    invite = _get_accessible_pending_invite(invite_id, current_user, db)
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
        move_user_to_family(current_user, invite.family_id, db)
    elif invite_type == JOIN_REQUEST:
        requester = invite.invited_by
        if not requester:
            raise HTTPException(status_code=400, detail="Invite requester no longer exists")
        if current_user.family_id != invite.family_id:
            raise HTTPException(
                status_code=400,
                detail="You can no longer approve this request because you are not in that family.",
            )
        move_user_to_family(requester, invite.family_id, db)
    else:
        raise HTTPException(status_code=400, detail="Unsupported invite type")

    invite.invited_user_id = current_user.id
    invite.status = "accepted"
    invite.accepted_at = utc_now()

    db.add(invite)
    db.commit()
    db.refresh(invite)

    return {
        "message": "Invite accepted successfully.",
        "invite": serialize_invite(invite),
    }


def decline_invite_for_user(invite_id: int, current_user: User, db: Session) -> dict:
    invite = _get_accessible_pending_invite(invite_id, current_user, db)

    invite.invited_user_id = current_user.id
    invite.status = "declined"
    invite.declined_at = utc_now()

    db.add(invite)
    db.commit()
    db.refresh(invite)

    return {
        "message": "Invite declined successfully.",
        "invite": serialize_invite(invite),
    }
