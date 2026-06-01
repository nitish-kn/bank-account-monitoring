from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..models.family import Family
from ..models.invites import Invite
from ..models.user import User


def _utc_now() -> datetime:
    return datetime.utcnow()


def _serialize_datetime(value: datetime | None) -> str | None:
    if not value:
        return None
    return value.isoformat()


def _serialize_user(user: User | None) -> dict | None:
    if not user:
        return None
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
    }


def _serialize_family(family: Family | None) -> dict | None:
    if not family:
        return None
    return {
        "id": family.id,
        "name": family.name,
        "owner_user_id": family.owner_user_id,
    }


def serialize_invite(invite: Invite) -> dict:
    return {
        "id": invite.id,
        "family_id": invite.family_id,
        "invited_email": invite.invited_email,
        "status": invite.status,
        "created_at": _serialize_datetime(invite.created_at),
        "expires_at": _serialize_datetime(invite.expires_at),
        "accepted_at": _serialize_datetime(invite.accepted_at),
        "declined_at": _serialize_datetime(invite.declined_at),
        "family": _serialize_family(invite.family),
        "invited_by": _serialize_user(invite.invited_by),
        "invited_user": _serialize_user(invite.invited_user),
    }


def _normalize_emails(emails: list[str]) -> list[str]:
    normalized: list[str] = []
    seen = set()

    for email in emails:
        cleaned = email.strip().lower()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            normalized.append(cleaned)

    return normalized


def _ensure_family(current_user: User, db: Session) -> Family:
    if current_user.family_id:
        family = db.query(Family).filter(Family.id == current_user.family_id).first()
        if family:
            return family

    family = Family(
        name=f"{current_user.name or current_user.email}'s Family",
        owner_user_id=current_user.id,
    )
    db.add(family)
    db.flush()

    current_user.family_id = family.id
    db.add(current_user)
    db.flush()

    return family


def _get_accessible_pending_invite(invite_id: int, current_user: User, db: Session) -> Invite:
    invite = (
        db.query(Invite)
        .filter(
            Invite.id == invite_id,
            Invite.status == "pending",
            or_(
                Invite.invited_user_id == current_user.id,
                Invite.invited_email == current_user.email,
            ),
        )
        .first()
    )

    if not invite:
        raise HTTPException(status_code=404, detail="Pending invite not found")

    if invite.expires_at and invite.expires_at < _utc_now():
        invite.status = "expired"
        db.add(invite)
        db.commit()
        raise HTTPException(status_code=400, detail="Invite has expired")

    return invite


def create_invites_for_user(emails: list[str], current_user: User, db: Session) -> dict:
    invited_emails = _normalize_emails(emails)

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
        "already_in_another_family": [],
        "already_pending": [],
    }
    valid_users: list[User] = []

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

        if invited_user.family_id and invited_user.family_id != current_user.family_id:
            warnings["already_in_another_family"].append(email)
            continue

        valid_users.append(invited_user)

    if not valid_users:
        return {
            "message": "No invites were created.",
            "invites": [],
            "warnings": warnings,
        }

    family = _ensure_family(current_user, db)
    created_invites: list[Invite] = []

    for invited_user in valid_users:
        pending_invite = (
            db.query(Invite)
            .filter(
                Invite.family_id == family.id,
                Invite.invited_user_id == invited_user.id,
                Invite.status == "pending",
            )
            .first()
        )
        if pending_invite:
            warnings["already_pending"].append(invited_user.email.lower())
            continue

        invite = Invite(
            family_id=family.id,
            invited_by_user_id=current_user.id,
            invited_user_id=invited_user.id,
            invited_email=invited_user.email.lower(),
            status="pending",
        )
        db.add(invite)
        created_invites.append(invite)

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
                Invite.invited_email == current_user.email,
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

    if current_user.family_id and current_user.family_id != invite.family_id:
        raise HTTPException(
            status_code=400,
            detail="You already belong to another family.",
        )

    current_user.family_id = invite.family_id
    invite.invited_user_id = current_user.id
    invite.status = "accepted"
    invite.accepted_at = _utc_now()

    db.add(current_user)
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
    invite.declined_at = _utc_now()

    db.add(invite)
    db.commit()
    db.refresh(invite)

    return {
        "message": "Invite declined successfully.",
        "invite": serialize_invite(invite),
    }
