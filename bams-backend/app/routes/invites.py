from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.dependencies import get_current_user
from ..database import get_db
from ..models.user import User
from ..services.invite_service import (
    accept_invite_for_user,
    create_invites_for_user,
    decline_invite_for_user,
    get_pending_invites_for_user,
    get_sent_invites_for_user,
)

router = APIRouter(prefix="/api/invites", tags=["invites"])


class InviteCreateRequest(BaseModel):
    emails: list[str]


@router.post("")
def create_invites(
    request: InviteCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return create_invites_for_user(request.emails, current_user, db)


@router.get("/pending")
def get_pending_invites(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_pending_invites_for_user(current_user, db)


@router.get("/sent")
def get_sent_invites(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_sent_invites_for_user(current_user, db)


@router.post("/{invite_id}/accept")
def accept_invite(
    invite_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return accept_invite_for_user(invite_id, current_user, db)


@router.post("/{invite_id}/decline")
def decline_invite(
    invite_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return decline_invite_for_user(invite_id, current_user, db)
