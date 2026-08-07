from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from ..core.dependencies import get_current_user
from ..database import get_db
from ..models.user import User
from ..services.gmail_service import fetch_user_emails, verify_gmail_access, fetch_gmail_attachment_bytes

router = APIRouter(prefix="/api/gmail", tags=["gmail"])

@router.get("/access")
def get_gmail_access(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    access_info = verify_gmail_access(current_user, db=db)
    return access_info


@router.post("/fetch")
def fetch_gmail_data(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Fetch the user's recent emails from Gmail."""
    email_payload = fetch_user_emails(current_user)
    if "emails" not in email_payload:
        raise HTTPException(status_code=500, detail="Failed to retrieve emails")
    return email_payload


@router.get("/message/{message_id}/attachment/{attachment_id}")
def get_gmail_attachment(
    message_id: str,
    attachment_id: str,
    current_user: User = Depends(get_current_user)
):
    """Fetch the raw binary file of a specific Gmail PDF attachment."""
    try:
        file_bytes = fetch_gmail_attachment_bytes(current_user, message_id, attachment_id)
        return Response(
            content=file_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"inline; filename=statement_{attachment_id}.pdf"
            }
        )
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))
