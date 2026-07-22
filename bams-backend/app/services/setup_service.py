import asyncio
from datetime import timedelta
from threading import Thread
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
import time

from fastapi import HTTPException
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session

from ..core.constants import (
    EMAIL_EXTRACTION_BATCH_SIZE,
    EMAIL_EXTRACTION_MAX_IN_FLIGHT,
    EMAIL_EXTRACTION_MAX_WORKERS,
    REQUIRED_SCHEMA,
    SHEET_NAME,
    SYNC_STATUS_COMPLETED,
    SYNC_STATUS_FAILED,
    SYNC_STATUS_RUNNING,
    SYNC_TIMEOUT_SECONDS,
    TRANSACTION_DATA_RANGE,
    TRANSACTION_HEADER_RANGE,
)
from ..database import SessionLocal
from ..models.user import User
from ..utils.date_utils import datetime_to_iso, utc_now
from ..utils.email_utils import latest_email_datetime
from ..utils.db_utils import (
    check_existing_gmail_message_id,
    get_unsynced_transactions_for_user,
    mark_transactions_sheet_synced,
    save_valid_transaction_to_db,
    transaction_to_schema_dict,
    update_parsed_status_to_db,
)
from .credentials import build_credentials
from .gmail_service import (
    get_latest_gmail_message_id,
    hydrate_user_message_page,
    iter_user_message_pages,
)


from ..utils.sheets_utils import _get_sheet_title, _append_sheet_rows, _read_existing_column_values
from ..utils.transaction_utils import (
    transactions_to_sheet_rows,
    check_valid_transactions,
    transaction_column_for_field,
)
from ..ds.llm.main import process_emails

# Thread tracking for stuck-sync detection
# Maps user_id -> {"thread": Thread, "started_at": float (time.time())}
_active_sync_threads: dict[int, dict] = {}


# --------------------- Helper functions
def _sync_metadata_payload(user: User) -> dict:
    """ Formats a User model's data into a clean dictionary payload for API/frontend consumption. """
    return {
        "last_synced_at": datetime_to_iso(user.last_synced_at),
        "last_synced_status": user.last_synced_status,
        "last_synced_email_date": datetime_to_iso(user.last_synced_email_date),
        "sync_status": user.sync_status,
    }

def _update_latest_synced_email_date(user: User, emails: list[dict] | None = None) -> None:
    """ Inspects a batch of emails, finds the most recent timestamp, and updates the user's tracking state if it's newer than what is currently saved. """
    latest_email_date = latest_email_datetime(emails or [])
    if latest_email_date and (
        not user.last_synced_email_date     # If the user is new, or its their first sync
        or latest_email_date > user.last_synced_email_date
    ):
        user.last_synced_email_date = latest_email_date




# --------------------- Functions to update db fields based on the operation
def _mark_sync_success(user: User, db: Session, emails: list[dict] | None = None) -> dict:
    """ Mark the variable as success in db, on completion of transaction"""
    _update_latest_synced_email_date(user, emails)
    user.last_synced_at = utc_now()
    user.last_synced_status = "success"
    user.sync_status = SYNC_STATUS_COMPLETED

    db.add(user)
    db.commit()
    db.refresh(user)
    return _sync_metadata_payload(user)

def _mark_sync_failed(user: User, db: Session) -> None:
    """ Mark the variable as failed in db, on failure of transaction """
    try:
        db.rollback()
        user.last_synced_at = utc_now()
        user.last_synced_status = "failed"
        user.sync_status = SYNC_STATUS_FAILED
        db.add(user)
        db.commit()
        db.refresh(user)
    except Exception as error:
        db.rollback()
        safe_error = str(error).encode('ascii', 'replace').decode('ascii')
        print(f"Failed to update sync failure metadata: {safe_error}")


def _sync_transactions_to_sheet(
    user: User,
    db: Session,
    sheets_service=None,
    sheet_title: str | None = None,
    transaction_ids: list[str] | None = None,
) -> dict:
    """Append committed DB transactions that have not yet been projected to Sheets.
        This function get unsynced DB transactions then:
        -> convert DB rows to transaction_schema dicts
        -> convert those dicts to Sheet rows
        -> append rows to Google Sheets
        -> mark transactions as synced """
    
    if not user.spreadsheet_id:
        return {"updated": False, "rows_written": 0}

    pending_transactions = get_unsynced_transactions_for_user(
        user.id,
        db,
        transaction_ids=transaction_ids,
    )
    if not pending_transactions:
        return {"updated": False, "rows_written": 0}

    if sheets_service is None:
        credentials = build_credentials(user)
        sheets_service = build("sheets", "v4", credentials=credentials)

    if sheet_title is None:
        sheet_title = _get_sheet_title(sheets_service, user.spreadsheet_id)
        
    dedupe_col = transaction_column_for_field("dedupe_key")
    existing_dedupe_keys = _read_existing_column_values(
        sheets_service, user.spreadsheet_id, sheet_title, dedupe_col
    )

    already_synced = []
    unique_pending = []
    for txn in pending_transactions:
        if txn.dedupe_key in existing_dedupe_keys:
            already_synced.append(txn)
        else:
            unique_pending.append(txn)
            
    if already_synced:
        mark_transactions_sheet_synced(already_synced, db)
        
    if not unique_pending:
        db.commit()
        return {"updated": False, "rows_written": 0}

    rows = transactions_to_sheet_rows([
        transaction_to_schema_dict(transaction)
        for transaction in unique_pending
    ])
    if not rows:
        db.commit()
        return {"updated": False, "rows_written": 0}

    result = _append_sheet_rows(sheets_service, user.spreadsheet_id, sheet_title, rows)
    mark_transactions_sheet_synced(unique_pending, db)
    db.commit()
    return result


def _is_sync_genuinely_running(user_id: int) -> bool:
    """Check if a sync thread is genuinely alive and within the timeout window.
    Returns True only if the thread exists, is alive, AND hasn't exceeded the soft timeout.
    Handles three cases:
      1. Server restarted -> dict is empty -> False
      2. Thread crashed   -> is_alive() is False -> False
      3. Thread hung/deadlocked -> is_alive() True but exceeded timeout -> False
    """
    entry = _active_sync_threads.get(user_id)
    if not entry:
        return False

    thread = entry.get("thread")
    started_at = entry.get("started_at", 0)

    if not thread or not thread.is_alive():
        # Thread is dead, clean up
        _active_sync_threads.pop(user_id, None)
        return False

    # Thread is alive — check soft timeout
    elapsed = time.time() - started_at
    if elapsed > SYNC_TIMEOUT_SECONDS:
        print(f"Sync thread for user {user_id} exceeded {SYNC_TIMEOUT_SECONDS}s timeout (elapsed: {elapsed:.0f}s). Treating as stuck.")
        _active_sync_threads.pop(user_id, None)
        return False

    return True




# -------------------------- Setup Functions ---------------------------

# Initial Setup Workflow - 1.1
def create_sheets_and_fill_schema(user: User) -> dict:
    """Create or validate the required sheet and ensure the header row matches REQUIRED_SCHEMA."""

    # Check correct user and schema permissions before proceeding with sheet setup
    credentials = build_credentials(user)

    # Use the credentials to build the Drive and Sheets service clients
    drive_service = build("drive", "v3", credentials=credentials)
    sheets_service = build("sheets", "v4", credentials=credentials)

    # Search for an existing spreadsheet with the specified name. If it exists, check the header row. 
    # If it doesn't exist or the header is incorrect, create/update it.
    query = f"name = '{SHEET_NAME}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false"

    try:
        # Search for existing spreadsheet with the specified name
        search_results = drive_service.files().list(q=query, fields="files(id)").execute()
        files = search_results.get("files", [])

        spreadsheet_id = None
        sheet_title = "Sheet1"
        should_write_schema = False
        should_clear_existing_rows = False

        # If a file is found, validate the header row. If not found, create a new spreadsheet and write the header.
        if files:
            spreadsheet_id = files[0]["id"]
            sheet_title = _get_sheet_title(sheets_service, spreadsheet_id)
            
            # Check if the existing sheet has the correct header row. If not, we will overwrite it with the required schema.
            try:
                result = sheets_service.spreadsheets().values().get(
                    spreadsheetId=spreadsheet_id,
                    range=f"'{sheet_title}'!{TRANSACTION_HEADER_RANGE}"
                ).execute()
                existing_header = result.get("values", [[]])[0]
                if existing_header != REQUIRED_SCHEMA:
                    should_write_schema = True
                    should_clear_existing_rows = True
            except HttpError:
                should_write_schema = True
                should_clear_existing_rows = True
        else:
            # No existing spreadsheet found, create a new one and write the required schema
            spreadsheet = sheets_service.spreadsheets().create(
                body={"properties": {"title": SHEET_NAME}},
                fields="spreadsheetId,sheets(properties(title))"
            ).execute()
            spreadsheet_id = spreadsheet.get("spreadsheetId")
            sheet_title = spreadsheet.get("sheets", [{}])[0].get("properties", {}).get("title", "Sheet1")
            should_write_schema = True

        # If we need to write the schema (either for a new sheet or to correct an existing one), do that now.
        if should_write_schema:
            if should_clear_existing_rows:
                sheets_service.spreadsheets().values().clear(
                    spreadsheetId=spreadsheet_id,
                    range=f"'{sheet_title}'!{TRANSACTION_DATA_RANGE}",
                    body={}
                ).execute()

            sheets_service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range=f"'{sheet_title}'!{TRANSACTION_HEADER_RANGE}",
                valueInputOption="RAW",
                body={"values": [REQUIRED_SCHEMA]}
            ).execute()

        return {
            "spreadsheet_id": spreadsheet_id,
            "sheet_title": sheet_title,
            "schema_written": should_write_schema,
        }
    except HttpError as error:
        raise HTTPException(status_code=500, detail=f"Google Sheets setup failed: {error}")
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unexpected setup error: {error}")

# Initial Setup Workflow - 1.2.1.1
def _run_backfill_sync_for_user(user_id: int) -> None:
    """ This is main backgound sync """

    db = SessionLocal()
    try:
        # 1. Load user from DB
        user = db.query(User).filter(User.id == user_id).first()
        if not user or not user.is_setup_completed or not user.spreadsheet_id:
            return

        # 2. Build Sheets client
        credentials = build_credentials(user)
        sheets_service = build("sheets", "v4", credentials=credentials)
        sheet_title = _get_sheet_title(sheets_service, user.spreadsheet_id)

        # 3. Get existing Gmail IDs from parsed table
        existing_gmail_message_ids = check_existing_gmail_message_id(user, db)

        # Dynamic start date for fetching emails. If the user has a last_synced_email_date, 
        # we start from one day before that to ensure we don't miss any emails.
        start_date = None
        if user.last_synced_email_date:
            start_date = user.last_synced_email_date - timedelta(days=1)

        # 4. Ask Gmail for message ID pages
        for message_page, page_idx, total_pages in iter_user_message_pages(user, start_date=start_date):
            
            # 5. Remove IDs already in DB
            new_messages = [
                message
                for message in message_page
                if message.get("id") and message.get("id") not in existing_gmail_message_ids
            ]
            already_parsed_count = len(message_page) - len(new_messages)
            print(
                "Email sync page: "
                f"user={user_id} page={page_idx}/{total_pages} "
                f"gmail_ids={len(message_page)} already_parsed={already_parsed_count} "
                f"new={len(new_messages)}"
            )

            if not new_messages:
                db.add(user)
                db.commit()
                continue

            # 6. Hydrate only new IDs
            new_emails = hydrate_user_message_page(user, new_messages)
            _update_latest_synced_email_date(user, new_emails)
            hydrated_email_ids = {
                email.get("id")
                for email in new_emails
                if email.get("id")
            }
            missing_hydrated_messages = [
                message
                for message in new_messages
                if message.get("id") and message.get("id") not in hydrated_email_ids
            ]
            print(
                "Email hydrate: "
                f"user={user_id} requested={len(new_messages)} "
                f"hydrated={len(new_emails)} failed={len(missing_hydrated_messages)}"
            )
            if missing_hydrated_messages:
                update_parsed_status_to_db(
                    user_id,
                    [],
                    db,
                    emails=[{"id": message.get("id")} for message in missing_hydrated_messages],
                    error="Gmail message detail could not be parsed after hydration.",
                )
                db.add(user)
                db.commit()
                existing_gmail_message_ids.update(
                    message.get("id")
                    for message in missing_hydrated_messages
                    if message.get("id")
                )

            if not new_emails:
                continue

            print(f"Emails from Gmail Api - Page {page_idx}/{total_pages} (count: {len(new_emails)})\n")

            # 7. Send hydrated emails to LLM batches
            for batch_result in _batch_extract_transactions(new_emails, user_id=user_id):
                if not batch_result:
                    continue

                batch_emails = batch_result.get("emails", [])
                transactions = batch_result.get("transactions", [])
                extraction_error = batch_result.get("error")

                if extraction_error:
                    print(
                        "Email extraction batch failed: "
                        f"user={user_id} emails={len(batch_emails)}"
                    )
                    update_parsed_status_to_db(
                        user_id,
                        [],
                        db,
                        emails=batch_emails,
                        error=extraction_error,
                    )
                    db.add(user)
                    db.commit()
                    existing_gmail_message_ids.update(
                        email.get("id")
                        for email in batch_emails
                        if email.get("id")
                    )
                    continue

                try:
                    # 8. Check for valid transaction with transaction objects only and save parsed transactions to DB
                    parsed_result_count = sum(
                        1
                        for transaction in transactions
                        if str(
                            (transaction.get("parser_metadata") or {}).get("parsed_status") or ""
                        ).strip().lower() == "parsed"
                    )
                    valid_transactions = check_valid_transactions(transactions)
                    saved_transactions = save_valid_transaction_to_db(
                        valid_transactions,
                        user_id,
                        db,
                    )

                    # 9. Save parsed/not_transaction/failed status
                    update_parsed_status_to_db(
                        user_id,
                        transactions,
                        db,
                        emails=batch_emails,
                    )

                    # 10. Commit DB batch
                    db.add(user)
                    db.commit()
                    print(
                        "Email batch saved: "
                        f"user={user_id} emails={len(batch_emails)} "
                        f"llm_rows={len(transactions)} parsed={parsed_result_count} "
                        f"valid_for_db={len(valid_transactions)} "
                        f"transactions_saved={len(saved_transactions)}"
                    )
                except Exception as error:
                    db.rollback()
                    safe_error = str(error).encode('ascii', 'replace').decode('ascii')
                    print(f"Failed to persist extracted batch: {safe_error[:300]}")
                    update_parsed_status_to_db(
                        user_id,
                        [],
                        db,
                        emails=batch_emails,
                        error=safe_error,
                    )
                    db.add(user)
                    db.commit()
                    existing_gmail_message_ids.update(
                        email.get("id")
                        for email in batch_emails
                        if email.get("id")
                    )
                    continue

                # 11. Append committed DB rows to Sheets
                if saved_transactions:
                    _sync_transactions_to_sheet(
                        user,
                        db,
                        sheets_service=sheets_service,
                        sheet_title=sheet_title,
                        transaction_ids=[transaction.id for transaction in saved_transactions],
                    )

                existing_gmail_message_ids.update(
                    email.get("id")
                    for email in batch_emails
                    if email.get("id")
                )

        _mark_sync_success(user, db)
    except Exception as error:
        safe_error = str(error).encode('ascii', 'replace').decode('ascii')
        print(f"Background sync failed for user {user_id}: {safe_error[:300]}")
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            _mark_sync_failed(user, db)
    finally:
        _active_sync_threads.pop(user_id, None)
        db.close()

# Function to use threading for fetching mails in parellel
# Initial Setup Workflow - 1.2.1
def _start_background_sync_thread(user_id: int) -> None:
    thread = Thread(
        target=_run_backfill_sync_for_user,
        args=(user_id,),
        daemon=True,
    )
    _active_sync_threads[user_id] = {
        "thread": thread,
        "started_at": time.time(),
    }
    thread.start()

# Main function to start background job for fetching email for 30 days at initial login
# Initial Setup Workflow - 1.2
def start_background_sync_for_user(user: User, db: Session) -> dict:
    if not user.is_setup_completed or not user.spreadsheet_id:
        raise HTTPException(status_code=400, detail="Setup must be completed before sync.")

    # If the user stops the setup in between but return later, this check this prevent to start the setup again for them
    if user.sync_status == SYNC_STATUS_RUNNING:
        if _is_sync_genuinely_running(user.id):
            return {
                "status": "running",
                "sync_status": SYNC_STATUS_RUNNING,
                "message": "Sync is already running in the background.",
                **_sync_metadata_payload(user),
            }
        else:
            # DB says running but thread is dead or timed out — reset
            print(f"Sync for user {user.id} marked as running but no active thread found. Resetting to failed.")
            _mark_sync_failed(user, db)
            db.refresh(user)

    user.sync_status = SYNC_STATUS_RUNNING
    user.last_synced_status = SYNC_STATUS_RUNNING
    db.add(user)
    db.commit()
    db.refresh(user)

    _start_background_sync_thread(user.id)

    return {
        "status": "running",
        "sync_status": user.sync_status,
        "message": "Sync started in the background.",
        **_sync_metadata_payload(user),
    }


def _batch_extract_transactions(
    emails: list[dict],
    user_id: int | None = None,
    batch_size: int = EMAIL_EXTRACTION_BATCH_SIZE,
    max_workers: int = EMAIL_EXTRACTION_MAX_WORKERS,
    max_in_flight: int = EMAIL_EXTRACTION_MAX_IN_FLIGHT,
):
    """ This is the limited-parallel streaming generator, at most 2 LLM calls run at once. As each batch finishes, it yields.
        This allows the caller to save each batch to DB immediately."""

    def safe_extract(batch_index, batch):
        try:
            print(f"Email LLM batch started: batch={batch_index} emails={len(batch)}")

            result = asyncio.run(process_emails(batch, user_id=user_id))

            if result is None:
                print(f"Email LLM batch returned no response: batch={batch_index}")
                return {"transactions": [], "error": "LLM extractor returned no response."}

            if not isinstance(result, list):
                print(
                    "Email LLM batch returned invalid type: "
                    f"batch={batch_index} type={type(result).__name__}"
                )
                return {"transactions": [], "error": f"LLM extractor returned {type(result).__name__} instead of list."}

            print(f"Email LLM batch success: batch={batch_index} transactions={len(result)}")
            return {"transactions": result, "error": None}

        except Exception as e:
            safe_e = str(e).encode('ascii', 'replace').decode('ascii')
            print(
                "Email LLM batch failed: "
                f"batch={batch_index} emails={len(batch)} error={safe_e[:300]}"
            )
            return {"transactions": [], "error": safe_e}

    batches = [
        emails[i:i + batch_size]
        for i in range(0, len(emails), batch_size)
    ]

    if not batches:
        return 
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        pending = {}

        def submit_batch(index):
            batch = batches[index]
            future = executor.submit(safe_extract, index + 1, batch)
            pending[future] = (index, batch)

        next_index = 0

        while next_index < min(max_in_flight, len(batches)):
            submit_batch(next_index)
            next_index += 1

        while pending:
            done, _ = wait(pending, return_when=FIRST_COMPLETED)

            for future in done:
                index, batch = pending.pop(future)

                try:
                    result = future.result()
                except Exception as error:
                    safe_error = str(error).encode('ascii', 'replace').decode('ascii')
                    result = {"transactions": [], "error": safe_error}

                yield {
                    "batch_index": index + 1,
                    "emails": batch,
                    "transactions": result.get("transactions", []),
                    "error": result.get("error"),
                }

                if next_index < len(batches):
                    submit_batch(next_index)
                    next_index += 1

# ------------- Main function that orchestrates the entire setup process with progress updates for the frontend to consume via SSE.

# Initial Setup Workflow - 1
async def setup_process_with_progress(user: User, db: Session):
    """Generator that yields progress messages as each setup step completes.
    This allows the frontend to track real-time progress via Server-Sent Events.
    """
    
    try:
        # Step 1: Create or validate sheets
        yield {"step": "sheets_checking", "message": "Checking for existing sheet..."}
        await asyncio.sleep(0.05)
        
        setup_result = create_sheets_and_fill_schema(user)
        spreadsheet_id = setup_result["spreadsheet_id"]
        sheet_title = setup_result["sheet_title"]
        
        if setup_result.get("schema_written"):
            yield {"step": "sheets_created", "message": "Sheet created and schema written!"}
        else:
            yield {"step": "sheets_validated", "message": "Existing sheet validated!"}
        await asyncio.sleep(0.05)
        
        yield {
            "step": "background_sync_starting",
            "message": "Starting 30-day email sync in the background...",
        }
        await asyncio.sleep(0.05)

        user.is_setup_completed = True
        user.spreadsheet_id = spreadsheet_id
        db.add(user)
        db.commit()
        db.refresh(user)

        sync_result = start_background_sync_for_user(user, db)

        yield {
            "step": "complete",
            "message": "Setup complete. We are syncing your last 30 days of emails in the background.",
            "status": "success",
            "data": {
                "spreadsheet_id": spreadsheet_id,
                "sheet_title": sheet_title,
                "emails_count": 0,
                "rows_written": 0,
                **sync_result,
            }
        }
        
    except HttpError as error:
        _mark_sync_failed(user, db)
        yield {
            "step": "error",
            "message": f"Google API error: {str(error)}",
            "status": "failed"
        }
    except Exception as error:
        _mark_sync_failed(user, db)
        yield {
            "step": "error",
            "message": f"Setup error: {str(error)}",
            "status": "failed"
        }

# Incremental Sync Workflow - 2
def perform_incremental_sync(user: User, db: Session):
    """Fetch only the newest Gmail messages after the last synced email date."""
    
    if not user.is_setup_completed or not user.spreadsheet_id:
        raise HTTPException(status_code=400, detail="Setup must be completed before sync.")

    if user.sync_status == SYNC_STATUS_RUNNING:
        if _is_sync_genuinely_running(user.id):
            return {
                "status": "running",
                "sync_status": SYNC_STATUS_RUNNING,
                "new_rows": 0,
                "message": "Background sync is already running.",
                **_sync_metadata_payload(user),
            }
        else:
            # DB says running but thread is dead or timed out — reset
            print(f"Incremental sync: user {user.id} marked running but no active thread. Resetting to failed.")
            _mark_sync_failed(user, db)
            db.refresh(user)

    # Fetch the single latest email ID from Gmail and check if it already exists in DB.
    try:
        latest_gmail_id = get_latest_gmail_message_id(user)
        if latest_gmail_id:
            existing_gmail_message_ids = check_existing_gmail_message_id(user, db)
            
            if latest_gmail_id in existing_gmail_message_ids:
                print(
                    "Incremental sync: "
                    f"user={user.id} latest_already_parsed=1 "
                    f"known_gmail_ids={len(existing_gmail_message_ids)}"
                )
                
                # It fetches only latest Gmail ID. If latest ID already exists in DB, it does not run full sync. But it still calls: So if DB had rows saved but Sheets failed earlier, manual sync can repair Sheets.
                sheet_result = _sync_transactions_to_sheet(user, db)
                sync_metadata = _mark_sync_success(user, db)
                return {
                    "status": "success",
                    "sync_status": SYNC_STATUS_COMPLETED,
                    "new_rows": sheet_result.get("rows_written", 0),
                    "message": "Dashboard is already up to date.",
                    **sync_metadata,
                }
            
    except Exception as e:
        # If check fails for some API/credentials reasons, fallback to background sync
        safe_error = str(e).encode('ascii', 'replace').decode('ascii')
        print(f"Latest email check failed, falling back to full sync: {safe_error[:300]}")

    return start_background_sync_for_user(user, db)

