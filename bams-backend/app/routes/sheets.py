from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..core.dependencies import get_current_org, require_permission
from ..database import get_db
from ..models.organization import Organization
from ..services.sheets_service import verify_sheet_access

router = APIRouter()

@router.get("/api/sheets/access", dependencies=[Depends(require_permission("sheets", "view"))])
def get_sheets_access(current_org: Organization = Depends(get_current_org), db: Session = Depends(get_db)):
    access_info = verify_sheet_access(current_org, db=db)
    return access_info