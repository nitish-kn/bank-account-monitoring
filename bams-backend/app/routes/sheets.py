from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..core.dependencies import get_current_user
from ..database import get_db
from ..models.user import User
from ..services.sheets_service import verify_sheet_access

router = APIRouter()

@router.get("/api/sheets/access")
def get_sheets_access(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    access_info = verify_sheet_access(current_user, db=db)
    return access_info