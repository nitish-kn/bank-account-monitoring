import asyncio
from datetime import timedelta
from threading import Thread
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

from fastapi import HTTPException
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session
from typing import Generator

from ..database import SessionLocal
from ..models.user import User
from ..utils.date_utils import datetime_to_iso, utc_now
from ..utils.email_utils import latest_email_datetime
from .credentials import build_credentials
from .gmail_service import DEFAULT_EMAIL_FETCH_LIMIT, fetch_user_emails, iter_user_email_pages, get_latest_gmail_message_id


from ..utils.sheets_utils import _read_existing_column_values, _get_sheet_title, _append_sheet_rows
from ..utils.transaction_utils import (
    GMAIL_MESSAGE_ID_COLUMN,
    TRANSACTION_DATA_RANGE,
    TRANSACTION_HEADER_RANGE,
    TRANSACTION_SCHEMA,
    TRANSACTION_SHEET_END_COLUMN,
    transactions_to_sheet_rows,
)
from ..ds.llm.services.extractor import extract_transactions

REQUIRED_SCHEMA = TRANSACTION_SCHEMA
SHEET_NAME = "Dashboard Data Sheet"
SYNC_STATUS_NOT_STARTED = "not_started"
SYNC_STATUS_RUNNING = "running"
SYNC_STATUS_COMPLETED = "completed"
SYNC_STATUS_FAILED = "failed"

CACHED_EMAILS: list[dict] = []


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
        not user.last_synced_email_date
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
    global CACHED_EMAILS

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user or not user.is_setup_completed or not user.spreadsheet_id:
            return

        credentials = build_credentials(user)
        sheets_service = build("sheets", "v4", credentials=credentials)
        sheet_title = _get_sheet_title(sheets_service, user.spreadsheet_id)

        # Pulls already synced message IDs from Google Sheet
        existing_gmail_message_ids = _read_existing_column_values(
            sheets_service,
            user.spreadsheet_id,
            sheet_title,
            GMAIL_MESSAGE_ID_COLUMN,
        )

        # Pulls batches of full emails from Gmail API
        start_date = None
        if user.last_synced_email_date:
            start_date = user.last_synced_email_date - timedelta(days=1)

        for emails in iter_user_email_pages(user, start_date=start_date):
            _update_latest_synced_email_date(user, emails)
            new_emails = [
                email
                for email in emails
                if email.get("id") and email.get("id") not in existing_gmail_message_ids
            ]

            if not new_emails:
                db.add(user)
                db.commit()
                continue
            
            print("Emails from Gmail Api - count:", len(new_emails), "\n")
            CACHED_EMAILS = []
            for batch_txns in _batch_extract_transactions(new_emails):
                if not batch_txns:
                    continue
                print("Extracted batch txn - count:", len(batch_txns), "\n" )

                rows = parse_emails_for_sheet(batch_txns)
                _append_sheet_rows(sheets_service, user.spreadsheet_id, sheet_title, rows)
                
                CACHED_EMAILS.extend(batch_txns)
                existing_gmail_message_ids.update(
                    transaction.get("gmail_message_id")
                    for transaction in batch_txns
                    if transaction.get("gmail_message_id")
                )

                db.add(user)
                db.commit()

        _mark_sync_success(user, db)
    except Exception as error:
        safe_error = str(error).encode('ascii', 'replace').decode('ascii')
        print(f"Background sync failed for user {user_id}: {safe_error}")
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            _mark_sync_failed(user, db)
    finally:
        db.close()

# Function to use threading for fetching mails in parellel
# Initial Setup Workflow - 1.2.1
def _start_background_sync_thread(user_id: int) -> None:
    Thread(
        target=_run_backfill_sync_for_user,
        args=(user_id,),
        daemon=True,
    ).start()

# Main function to start background job for fetching email for 30 days at initial login
# Initial Setup Workflow - 1.2
def start_background_sync_for_user(user: User, db: Session) -> dict:
    if not user.is_setup_completed or not user.spreadsheet_id:
        raise HTTPException(status_code=400, detail="Setup must be completed before sync.")

    # If the user stops the setup in between but return later, this check this prevent to start the setup again for them
    if user.sync_status == SYNC_STATUS_RUNNING:
        return {
            "status": "running",
            "sync_status": SYNC_STATUS_RUNNING,
            "message": "Sync is already running in the background.",
            **_sync_metadata_payload(user),
        }

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

MAX_WORKERS = 3

# def _batch_extract_transactions(emails: list[dict]) -> list[dict]:
#     def safe_extract(batch_index, batch):
#         try:
#             print(f"Batch {batch_index} started")
#             print("Batch IDs:", [email.get("id") for email in batch])

#             result = extract_transactions(batch)

#             if result is None:
#                 print(f"Batch {batch_index} returned None")
#                 return []

#             if not isinstance(result, list):
#                 print(f"Batch {batch_index} returned non-list:", type(result), result)
#                 return []

#             print(f"Batch {batch_index} success, transactions:", len(result))
#             return result

#         except Exception as e:
#             print(f"Batch {batch_index} extraction failed: {e}")
#             print("Failed batch IDs:", [email.get("id") for email in batch])
#             return []

#     batches = [emails[i:i + BATCH_SIZE] for i in range(0, len(emails), BATCH_SIZE)]

#     if not batches:
#         return []

#     extracted_transactions = []

#     with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(batches))) as executor:
#         futures = [
#             executor.submit(safe_extract, index + 1, batch)
#             for index, batch in enumerate(batches)
#         ]

#         for future in as_completed(futures):
#             batch_result = future.result()
#             extracted_transactions.extend(batch_result)

#     return extracted_transactions



BATCH_SIZE = 10

def _batch_extract_transactions(emails: list[dict]) -> Generator[list[dict], None, None]:
    def safe_extract(batch_index, batch):
        try:
            print(f"Batch {batch_index} started")
            print("Batch IDs:", [email.get("id") for email in batch])

            result = extract_transactions(batch)

            if result is None:
                print(f"Batch {batch_index} returned None")
                return []

            if not isinstance(result, list):
                print(f"Batch {batch_index} returned non-list:", type(result), result)
                return []

            print(f"Batch {batch_index} success, transactions:", len(result))
            return result

        except Exception as e:
            safe_e = str(e).encode('ascii', 'replace').decode('ascii')
            print(f"Batch {batch_index} extraction failed: {safe_e}")
            print("Failed batch IDs:", [email.get("id") for email in batch])
            return []

    batches = [emails[i:i + BATCH_SIZE] for i in range(0, len(emails), BATCH_SIZE)]

    if not batches:
        return

    for index, batch in enumerate(batches):
        batch_result = safe_extract(index + 1, batch)
        yield batch_result

        if index < len(batches) - 1:
            print("Waiting 60 seconds before next batch...")
            time.sleep(60)

# Incremental Sync Workflow - 2.1
def parse_emails_for_sheet(transactions: list[dict]) -> list[list[str]]:
    """Convert extracted transaction data into rows that match REQUIRED_SCHEMA."""
    return transactions_to_sheet_rows(transactions)





def fill_sheet_with_emails(user: User, spreadsheet_id: str, sheet_title: str, rows: list[list[str]]) -> dict:
    """Write email rows into the sheet below the header."""

    # If there are no rows to write, we can skip the API call and return early.
    if not rows:
        return {"updated": False, "message": "No email data to write."}

    # Build credentials and initialize the Sheets API client
    credentials = build_credentials(user)
    sheets_service = build("sheets", "v4", credentials=credentials)
    end_row = len(rows) + 1
    range_name = f"'{sheet_title}'!A2:{TRANSACTION_SHEET_END_COLUMN}{end_row}"

    try:
        # Write the email data rows into the sheet starting from row 2 (below the header)
        sheets_service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=range_name,
            valueInputOption="RAW",
            body={"values": rows}
        ).execute()
        return {"updated": True, "rows_written": len(rows)}
    except HttpError as error:
        raise HTTPException(status_code=500, detail=f"Failed to write emails to sheet: {error}")

def start_email_fetching_process(user: User, spreadsheet_id: str, sheet_title: str) -> dict:
    """Fetch Gmail emails, cache them, parse them, and fill the sheet."""
    global CACHED_EMAILS

    # Fetch the user's emails from Gmail using the stored access token. Cache the raw email data in memory for quick access.
    fetch_result = fetch_user_emails(user, max_results=DEFAULT_EMAIL_FETCH_LIMIT)
    emails = fetch_result.get("emails", [])

    if not emails:
        return {"emails_count": 0, "sheetUpdated": {"updated": False, "message": "No emails were found."}}

    extracted_txns = _batch_extract_transactions(emails)
    CACHED_EMAILS = extracted_txns

    # Parse the extracted transactions into rows that match the required schema and write them into the sheet.
    parsed_rows = parse_emails_for_sheet(extracted_txns)
    write_result = fill_sheet_with_emails(user, spreadsheet_id, sheet_title, parsed_rows)
    return {
        "emails_count": len(emails),
        "sheetUpdated": write_result,
    }




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

def append_sheet_with_emails(user: User, spreadsheet_id: str, sheet_title: str, new_rows: list[list[str]]):
    """Safely append new rows to the Google Sheet using the append API."""
    if not new_rows:
        return {"updated": False, "rows_written": 0}

    credentials = build_credentials(user)
    sheets_service = build("sheets", "v4", credentials=credentials)

    try:
        return _append_sheet_rows(sheets_service, spreadsheet_id, sheet_title, new_rows)
    except HttpError as error:
        raise HTTPException(status_code=500, detail=f"Failed to append emails: {error}")

# Incremental Sync Workflow - 2
def perform_incremental_sync(user: User, db: Session):
    """Fetch only the newest Gmail messages after the last synced email date."""
    if not user.is_setup_completed or not user.spreadsheet_id:
        raise HTTPException(status_code=400, detail="Setup must be completed before sync.")

    if user.sync_status == SYNC_STATUS_RUNNING:
        return {
            "status": "running",
            "sync_status": SYNC_STATUS_RUNNING,
            "new_rows": 0,
            "message": "Background sync is already running.",
            **_sync_metadata_payload(user),
        }

    # Fetch the single latest email ID from Gmail and check if it's already in the sheet.
    try:
        credentials = build_credentials(user)
        sheets_service = build("sheets", "v4", credentials=credentials)
        sheet_title = _get_sheet_title(sheets_service, user.spreadsheet_id)
        
        # Fetch the latest email ID from Gmail
        latest_gmail_id = get_latest_gmail_message_id(user)
        if latest_gmail_id:
            # Check if this ID is already in the sheet
            existing_gmail_message_ids = _read_existing_column_values(
                sheets_service,
                user.spreadsheet_id,
                sheet_title,
                GMAIL_MESSAGE_ID_COLUMN,
            )
            if latest_gmail_id in existing_gmail_message_ids:
                # Up to date!
                # Mark as success to clear running statuses if any
                sync_metadata = _mark_sync_success(user, db)
                return {
                    "status": "success",
                    "sync_status": SYNC_STATUS_COMPLETED,
                    "new_rows": 0,
                    "message": "Dashboard is already up to date.",
                    **sync_metadata,
                }
    except Exception as e:
        # If check fails for some API/credentials reasons, fallback to background sync
        safe_error = str(e).encode('ascii', 'replace').decode('ascii')
        print(f"Latest email check failed, falling back to full sync: {safe_error}")

    return start_background_sync_for_user(user, db)


def get_cached_emails() -> list[dict]:
    """Return the last fetched email payloads."""
    return CACHED_EMAILS
