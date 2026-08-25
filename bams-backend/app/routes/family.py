from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..core.dependencies import get_current_org
from ..database import get_db
from ..models.organization import Organization
from ..services.family_service import get_family_members_for_org, get_family_emails_for_org

router = APIRouter(prefix="/api/family", tags=["family"])


@router.get("/members")
def get_family_members(
    current_org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    return get_family_members_for_org(current_org, db)


@router.get("/emails")
def get_family_emails(
    current_org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """Retrieve combined email data from all family members' Google Sheets.
    
    Returns a merged list of emails from all family members, tagged with who the email came from.
    If a family member's data cannot be fetched, they are listed in 'failed_members'.
    """
    return get_family_emails_for_org(current_org, db)
