from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session
from typing import List

from ..core.dependencies import get_current_user
from ..database import get_db
from ..models.user import User
from ..services.statements_service import process_and_upload_statements

router = APIRouter()

@router.post("/api/statements/upload")
async def upload_statements(
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Route handler to receive statement files, parse them using LLM,
    and save extracted transaction rows to Google Sheets.
    """
    return await process_and_upload_statements(current_user, files)
