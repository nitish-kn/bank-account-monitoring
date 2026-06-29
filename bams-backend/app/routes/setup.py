from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
import asyncio
import json
from sqlalchemy.orm import Session

from ..core.dependencies import get_current_user
from ..models.user import User
from ..services.setup_service import setup_process_with_progress, perform_incremental_sync, _is_sync_genuinely_running, _mark_sync_failed, SYNC_STATUS_RUNNING
from ..database import get_db
from ..services.setup_service import build_credentials
from ..utils.date_utils import datetime_to_iso
from ..utils.transaction_utils import (
    TRANSACTION_DATA_RANGE,
    parse_sheet_transaction_row,
    transaction_timestamp,
)
from googleapiclient.discovery import build
from ..utils.sheets_utils import _get_sheet_title


router = APIRouter(prefix="/api/setup", tags=["setup"])


@router.get("/stream")
async def stream_setup(current_user: User = Depends(get_current_user), db: Session = Depends(get_db) ):
    """It starts the setup process and yields progress updates in real-time. Stream setup progress via Server-Sent Events.
        Frontend connects with EventSource and receives real-time progress updates.
    """
    
    async def event_generator():
        """Generator that yields SSE formatted messages."""
        try:
            yield f"data: {json.dumps({'step': 'connected', 'message': 'Setup stream connected...'})}\n\n"
            await asyncio.sleep(0.05)
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
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

@router.get("/status")
def get_setup_status(current_user: User = Depends(get_current_user)):
    """Check if the user has completed initial setup and has all permissions.
        It is for returning users."""
    
    return {
        "is_setup_completed": current_user.is_setup_completed,
        "spreadsheet_id": current_user.spreadsheet_id,
        "has_permissions": current_user.has_email_permissions and current_user.has_sheets_permissions,
        "last_synced_at": datetime_to_iso(current_user.last_synced_at),
        "last_synced_status": current_user.last_synced_status,
        "last_synced_email_date": datetime_to_iso(current_user.last_synced_email_date),
        "sync_status": current_user.sync_status,
    }


@router.get("/sync-status")
def get_sync_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """ Get the status while background job and dashboard sync of fetching mails are running.
        Also detects stuck syncs (dead thread / timeout) and auto-resets them.
    """
    # If DB says running, verify the thread is genuinely alive
    if current_user.sync_status == SYNC_STATUS_RUNNING:
        if not _is_sync_genuinely_running(current_user.id):
            print(f"Sync status poll: user {current_user.id} marked running but no active thread. Resetting to failed.")
            _mark_sync_failed(current_user, db)
            db.refresh(current_user)

    return {
        "sync_status": current_user.sync_status,
        "last_synced_at": datetime_to_iso(current_user.last_synced_at),
        "last_synced_status": current_user.last_synced_status,
        "last_synced_email_date": datetime_to_iso(current_user.last_synced_email_date),
    }

@router.post("/sync")
def sync_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Trigger incremental synchronization of emails to Google Sheets."""
    if not current_user.is_setup_completed or not current_user.spreadsheet_id:
        raise HTTPException(
            status_code=400,
            detail="Dashboard setup must be completed before synchronization."
        )
    
    return perform_incremental_sync(current_user, db)

@router.get("/emails")
def get_synced_emails(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve parsed transactions directly from the user's Google Sheet."""
    
    
    if not current_user.is_setup_completed or not current_user.spreadsheet_id:
        return {"transactions": []}
    
    credentials = build_credentials(current_user)
    sheets_service = build("sheets", "v4", credentials=credentials)
    
    try:
        sheet_title = _get_sheet_title(sheets_service, current_user.spreadsheet_id)
        # Read all transaction-schema rows except the header.
        result = sheets_service.spreadsheets().values().get(
            spreadsheetId=current_user.spreadsheet_id,
            range=f"'{sheet_title}'!{TRANSACTION_DATA_RANGE}"
        ).execute()
        
        rows = result.get("values", [])
        
        transactions = []
        for row in rows:
            transaction = parse_sheet_transaction_row(row)
            if transaction:
                transactions.append(transaction)

        transactions.sort(key=transaction_timestamp, reverse=True)
        return {"transactions": transactions}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read synced transactions from Google Sheets: {str(e)}"
        )
