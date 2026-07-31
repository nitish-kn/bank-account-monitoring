from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session
from typing import List

from ..core.dependencies import get_current_user
from ..database import get_db
from ..models.user import User
from ..services.statements_service import (
    get_statement_upload_job,
    process_and_upload_statements,
)

router = APIRouter()

@router.post("/api/statements/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_statements(
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Route handler to receive statement files, parse them using LLM,
    and save extracted transaction rows through the DB transaction pipeline.
    """
    return await process_and_upload_statements(current_user, files, db)


@router.get("/api/statements/upload/{job_id}/status")
def get_statement_upload_status(
    job_id: str,
    current_user: User = Depends(get_current_user),
):
    """Return the background status for a statement upload job."""
    return get_statement_upload_job(current_user.id, job_id)
