from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from datetime import timezone
from email.utils import parsedate_to_datetime
import json
from sqlalchemy.orm import Session

from ..core.dependencies import get_current_user
from ..models.user import User
from ..services.setup_service import setup_process_with_progress, perform_incremental_sync
from ..database import get_db
from ..services.setup_service import _get_sheet_title, build_credentials
from googleapiclient.discovery import build


router = APIRouter(prefix="/api/setup", tags=["setup"])


def _email_timestamp(email: dict) -> float:
    """Return a sortable timestamp for sheet email rows."""
    try:
        return parsedate_to_datetime(email.get("date", "")).timestamp()
    except (TypeError, ValueError, IndexError, AttributeError, OverflowError):
        return 0


def _datetime_to_iso(value) -> str | None:
    if not value:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc).isoformat()
    return value.astimezone(timezone.utc).isoformat()


@router.get("/stream")
async def stream_setup(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Stream setup progress via Server-Sent Events. It starts the setup process and yields progress updates in real-time.
    Frontend connects with EventSource and receives real-time progress updates.
    """
    
    async def event_generator():
        """Generator that yields SSE formatted messages."""
        try:
            async for progress_msg in setup_process_with_progress(current_user, db):
                # Format as Server-Sent Event
                yield f"data: {json.dumps(progress_msg)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'step': 'error', 'message': str(e), 'status': 'failed'})}\n\n"
    
    return StreamingResponse(
          event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )

@router.get("/status")
def get_setup_status(current_user: User = Depends(get_current_user)):
    """Check if the user has completed initial setup and has all permissions."""
    return {
        "is_setup_completed": current_user.is_setup_completed,
        "spreadsheet_id": current_user.spreadsheet_id,
        "has_permissions": current_user.has_email_permissions and current_user.has_sheets_permissions,
        "last_synced_at": _datetime_to_iso(current_user.last_synced_at),
        "last_synced_status": current_user.last_synced_status,
        "last_synced_email_date": _datetime_to_iso(current_user.last_synced_email_date),
    }

@router.post("/sync")
async def sync_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Trigger incremental synchronization of emails to Google Sheets."""
    if not current_user.is_setup_completed or not current_user.spreadsheet_id:
        raise HTTPException(
            status_code=400,
            detail="Dashboard setup must be completed before synchronization."
        )
    
    return await perform_incremental_sync(current_user, db)

@router.get("/emails")
def get_synced_emails(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve all parsed emails directly from the user's Google Sheet."""
    
    
    if not current_user.is_setup_completed or not current_user.spreadsheet_id:
        return {"emails": []}
    
    credentials = build_credentials(current_user)
    sheets_service = build("sheets", "v4", credentials=credentials)
    
    try:
        sheet_title = _get_sheet_title(sheets_service, current_user.spreadsheet_id)
        # Read the values from A2 to F (all rows except header)
        result = sheets_service.spreadsheets().values().get(
            spreadsheetId=current_user.spreadsheet_id,
            range=f"'{sheet_title}'!A2:F"
        ).execute()
        
        rows = result.get("values", [])
        
        emails = []
        for row in rows:
            if not row:
                continue
            # Pad-fill to ensure 6 elements
            row_padded = row + [""] * (6 - len(row))
            emails.append({
                "id": row_padded[0],
                "subject": row_padded[1],
                "date": row_padded[2],
                "status": row_padded[3],
                "snippet": row_padded[4],
                "body": row_padded[5],
            })

        emails.sort(key=_email_timestamp, reverse=True)
        return {"emails": emails}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read synced emails from Google Sheets: {str(e)}"
        )
