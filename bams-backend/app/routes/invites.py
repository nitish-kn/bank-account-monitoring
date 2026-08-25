from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.dependencies import get_current_org
from ..database import get_db
from ..models.organization import Organization
from ..services.invite_service import (
    accept_invite_for_org,
    create_invites_for_org,
    decline_invite_for_org,
    get_pending_invites_for_org,
    get_sent_invites_for_org,
)

router = APIRouter(prefix="/api/invites", tags=["invites"])


class InviteCreateRequest(BaseModel):
    emails: list[str]


@router.post("")
def create_invites(
    request: InviteCreateRequest,
    current_org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    return create_invites_for_org(request.emails, current_org, db)


@router.get("/pending")
def get_pending_invites(
    current_org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    return get_pending_invites_for_org(current_org, db)


@router.get("/sent")
def get_sent_invites(
    current_org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    return get_sent_invites_for_org(current_org, db)


@router.post("/{invite_id}/accept")
def accept_invite(
    invite_id: int,
    current_org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    return accept_invite_for_org(invite_id, current_org, db)


@router.post("/{invite_id}/decline")
def decline_invite(
    invite_id: int,
    current_org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    return decline_invite_for_org(invite_id, current_org, db)
