from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
import asyncio
import json
from sqlalchemy.orm import Session

from ..core.constants import SYNC_STATUS_RUNNING
from ..core.dependencies import get_current_org, require_permission
from ..models.transactions import Transactions
from ..models.organization import Organization
from ..services.setup_service import setup_process_with_progress, perform_incremental_sync, _is_sync_genuinely_running, _mark_sync_failed
from ..database import get_db
from ..utils.date_utils import datetime_to_iso
from ..utils.db_utils import transaction_to_schema_dict
from ..utils.transaction_utils import transaction_timestamp


router = APIRouter(prefix="/api/setup", tags=["setup"])


@router.get("/stream")
async def stream_setup(current_org: Organization = Depends(get_current_org), db: Session = Depends(get_db) ):
    """It starts the setup process and yields progress updates in real-time. Stream setup progress via Server-Sent Events.
        Frontend connects with EventSource and receives real-time progress updates.
    """
    
    async def event_generator():
        """Generator that yields SSE formatted messages."""
        try:
            yield f"data: {json.dumps({'step': 'connected', 'message': 'Setup stream connected...'})}\n\n"
            await asyncio.sleep(0.05)
            async for progress_msg in setup_process_with_progress(current_org, db):
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
def get_setup_status(current_org: Organization = Depends(get_current_org)):
    """Check if the org has completed initial setup and has all permissions.
        It is for returning orgs."""
    
    return {
        "is_setup_completed": current_org.is_setup_completed,
        "spreadsheet_id": current_org.spreadsheet_id,
        "has_permissions": current_org.has_email_permissions and current_org.has_sheets_permissions,
        "last_synced_at": datetime_to_iso(current_org.last_synced_at),
        "last_synced_status": current_org.last_synced_status,
        "last_synced_email_date": datetime_to_iso(current_org.last_synced_email_date),
        "sync_status": current_org.sync_status,
    }


@router.get("/sync-status")
def get_sync_status(current_org: Organization = Depends(get_current_org), db: Session = Depends(get_db)):
    """ Get the status while background job and dashboard sync of fetching mails are running.
        Also detects stuck syncs (dead thread / timeout) and auto-resets them.
    """
    # If DB says running, verify the thread is genuinely alive
    if current_org.sync_status == SYNC_STATUS_RUNNING:
        if not _is_sync_genuinely_running(current_org.id):
            print(f"Sync status poll: org {current_org.id} marked running but no active thread. Resetting to failed.")
            _mark_sync_failed(current_org, db)
            db.refresh(current_org)

    return {
        "sync_status": current_org.sync_status,
        "last_synced_at": datetime_to_iso(current_org.last_synced_at),
        "last_synced_status": current_org.last_synced_status,
        "last_synced_email_date": datetime_to_iso(current_org.last_synced_email_date),
    }

@router.post("/sync", dependencies=[Depends(require_permission("sync_data", "trigger"))])
def sync_dashboard(
    current_org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db)
):
    """Trigger incremental synchronization of emails to Google Sheets."""
    if not current_org.is_setup_completed or not current_org.spreadsheet_id:
        raise HTTPException(
            status_code=400,
            detail="Dashboard setup must be completed before synchronization."
        )
    
    return perform_incremental_sync(current_org, db)

@router.get("/emails")
def get_synced_emails(
    current_org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db)
):
    """Fetch parsed transactions from the DB instead of sheets and send them to frontend"""
    
    
    if not current_org.is_setup_completed:
        return {"transactions": []}

    try:
        transaction_rows = (
            db.query(Transactions)
            .filter(Transactions.org_id == current_org.id)
            .all()
        )
        transactions = [
            transaction_to_schema_dict(transaction)
            for transaction in transaction_rows
        ]
        transactions.sort(key=transaction_timestamp, reverse=True)
        return {"transactions": transactions}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read synced transactions from database: {str(e)}"
        )
