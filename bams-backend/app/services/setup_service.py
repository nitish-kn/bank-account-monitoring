from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session

from ..models.user import User
from .credentials import build_credentials
from .gmail_service import DEFAULT_EMAIL_FETCH_LIMIT, fetch_user_emails

REQUIRED_SCHEMA = ["Email ID", "Subject", "Date Received", "Status", "Parsed Content", "Email Body"]
SHEET_NAME = "Dashboard Data Sheet"

CACHED_EMAILS: list[dict] = []


def _utc_now() -> datetime:
    return datetime.utcnow()


def _datetime_to_iso(value: datetime | None) -> str | None:
    if not value:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc).isoformat()
    return value.astimezone(timezone.utc).isoformat()


def _email_internal_datetime(email: dict) -> datetime | None:
    try:
        internal_date = email.get("internalDate")
        if not internal_date:
            return None
        return datetime.fromtimestamp(int(internal_date) / 1000, tz=timezone.utc).replace(tzinfo=None)
    except (TypeError, ValueError, OSError, OverflowError):
        return None


def _latest_email_datetime(emails: list[dict]) -> datetime | None:
    email_dates = [
        email_date
        for email_date in (_email_internal_datetime(email) for email in emails)
        if email_date
    ]
    return max(email_dates) if email_dates else None


def _sync_metadata_payload(user: User) -> dict:
    return {
        "last_synced_at": _datetime_to_iso(user.last_synced_at),
        "last_synced_status": user.last_synced_status,
        "last_synced_email_date": _datetime_to_iso(user.last_synced_email_date),
    }


def _mark_sync_success(user: User, db: Session, emails: list[dict] | None = None) -> dict:
    latest_email_date = _latest_email_datetime(emails or [])

    user.last_synced_at = _utc_now()
    user.last_synced_status = "success"
    if latest_email_date and (
        not user.last_synced_email_date
        or latest_email_date > user.last_synced_email_date
    ):
        user.last_synced_email_date = latest_email_date

    db.add(user)
    db.commit()
    db.refresh(user)
    return _sync_metadata_payload(user)


def _mark_sync_failed(user: User, db: Session) -> None:
    try:
        db.rollback()
        user.last_synced_at = _utc_now()
        user.last_synced_status = "failed"
        db.add(user)
        db.commit()
        db.refresh(user)
    except Exception as error:
        db.rollback()
        print(f"Failed to update sync failure metadata: {error}")


def _get_sheet_title(sheets_service: Any, spreadsheet_id: str) -> str:
    """Return the first sheet title from a spreadsheet. Fallback to Sheet1."""
    try:
        spreadsheet = sheets_service.spreadsheets().get(
            spreadsheetId=spreadsheet_id,
            fields="sheets(properties(title))"
        ).execute()
        sheets = spreadsheet.get("sheets", [])
        if sheets:
            return sheets[0].get("properties", {}).get("title", "Sheet1")
    except HttpError:
        pass
    return "Sheet1"


async def create_sheets_and_fill_schema(user: User) -> dict:
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

        # If a file is found, validate the header row. If not found, create a new spreadsheet and write the header.
        if files:
            spreadsheet_id = files[0]["id"]
            sheet_title = _get_sheet_title(sheets_service, spreadsheet_id)
            
            # Check if the existing sheet has the correct header row. If not, we will overwrite it with the required schema.
            try:
                result = sheets_service.spreadsheets().values().get(
                    spreadsheetId=spreadsheet_id,
                    range=f"'{sheet_title}'!A1:F1"
                ).execute()
                existing_header = result.get("values", [[]])[0]
                if existing_header != REQUIRED_SCHEMA:
                    should_write_schema = True
            except HttpError:
                should_write_schema = True
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
            sheets_service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range=f"'{sheet_title}'!A1:F1",
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


def parse_emails_for_sheet(emails: list[dict]) -> list[list[str]]:
    """Convert parsed Gmail message data into rows that match REQUIRED_SCHEMA."""
    rows: list[list[str]] = []
    
    for email in emails:
        rows.append([
            email.get("id", ""),
            email.get("subject", ""),
            email.get("date", ""),
            email.get("status", "New"),
            email.get("snippet", ""),
            email.get("body", ""),
        ])

    return rows


async def fill_sheet_with_emails(user: User, spreadsheet_id: str, sheet_title: str, rows: list[list[str]]) -> dict:
    """Write email rows into the sheet below the header."""

    # If there are no rows to write, we can skip the API call and return early.
    if not rows:
        return {"updated": False, "message": "No email data to write."}

    # Build credentials and initialize the Sheets API client
    credentials = build_credentials(user)
    sheets_service = build("sheets", "v4", credentials=credentials)
    end_row = len(rows) + 1
    range_name = f"'{sheet_title}'!A2:F{end_row}"

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


async def start_email_fetching_process(user: User, spreadsheet_id: str, sheet_title: str) -> dict:
    """Fetch Gmail emails, cache them, parse them, and fill the sheet."""
    global CACHED_EMAILS

    # Fetch the user's emails from Gmail using the stored access token. Cache the raw email data in memory for quick access.
    fetch_result = fetch_user_emails(user, max_results=DEFAULT_EMAIL_FETCH_LIMIT)
    emails = fetch_result.get("emails", [])

    CACHED_EMAILS = emails

    if not emails:
        return {"emails_count": 0, "sheetUpdated": {"updated": False, "message": "No emails were found."}}

    # Parse the raw email data into rows that match the required schema and write them into the sheet.
    parsed_rows = parse_emails_for_sheet(emails)
    write_result = await fill_sheet_with_emails(user, spreadsheet_id, sheet_title, parsed_rows)
    return {
        "emails_count": len(emails),
        "sheetUpdated": write_result,
    }


def get_cached_emails() -> list[dict]:
    """Return the last fetched email payloads."""
    return CACHED_EMAILS

# Main function that orchestrates the entire setup process with progress updates for the frontend to consume via SSE.
async def setup_process_with_progress(user: User, db: Session):
    """Generator that yields progress messages as each setup step completes.
    
    This allows the frontend to track real-time progress via Server-Sent Events.
    """
    
    try:
        # Step 1: Create or validate sheets
        yield {"step": "sheets_checking", "message": "Checking for existing sheet..."}
        
        setup_result = await create_sheets_and_fill_schema(user)
        spreadsheet_id = setup_result["spreadsheet_id"]
        sheet_title = setup_result["sheet_title"]
        
        if setup_result.get("schema_written"):
            yield {"step": "sheets_created", "message": "Sheet created and schema written!"}
        else:
            yield {"step": "sheets_validated", "message": "Existing sheet validated!"}
        
        # Step 2: Fetch emails from Gmail
        yield {"step": "emails_fetching", "message": "Fetching tracked emails from Gmail..."}
        
        fetch_result = fetch_user_emails(user, max_results=DEFAULT_EMAIL_FETCH_LIMIT)
        emails = fetch_result.get("emails", [])
        
        yield {
            "step": "emails_fetched",
            "message": f"Found {len(emails)} tracked emails!",
            "count": len(emails)
        }
        
        # Step 3: Parse emails
        yield {"step": "emails_parsing", "message": "Parsing email data..."}
        
        parsed_rows = parse_emails_for_sheet(emails)
        
        yield {
            "step": "emails_parsed",
            "message": f"Parsed {len(parsed_rows)} emails!",
            "count": len(parsed_rows)
        }
        
        # Step 4: Fill sheet with emails
        yield {"step": "sheet_writing", "message": "Writing emails to Google Sheet..."}
        
        global CACHED_EMAILS
        CACHED_EMAILS = emails
        
        write_result = await fill_sheet_with_emails(user, spreadsheet_id, sheet_title, parsed_rows)
        
        yield {
            "step": "sheet_written",
            "message": f"Successfully wrote {write_result.get('rows_written', 0)} rows to sheet!",
            "rows": write_result.get('rows_written', 0)
        }
        
        # Step 5: Complete
        # Save setup status and spreadsheet ID to user record in DB
        sync_metadata = {}
        try:
            user.is_setup_completed = True
            user.spreadsheet_id = spreadsheet_id
            sync_metadata = _mark_sync_success(user, db, emails)
        except Exception as db_err:
            # Log DB error but allow setup completion message to go through
            print(f"Failed to update user DB status: {db_err}")

        yield {
            "step": "complete",
            "message": "Setup complete!",
            "status": "success",
            "data": {
                "spreadsheet_id": spreadsheet_id,
                "sheet_title": sheet_title,
                "emails_count": len(emails),
                "rows_written": write_result.get('rows_written', 0),
                **sync_metadata,
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

async def append_sheet_with_emails(user: User, spreadsheet_id: str, sheet_title: str, new_rows: list[list[str]]):
    """Safely append new rows to the Google Sheet using the append API."""
    if not new_rows:
        return {"updated": False, "rows_written": 0}

    credentials = build_credentials(user)
    sheets_service = build("sheets", "v4", credentials=credentials)
    range_name = f"'{sheet_title}'!A2"

    try:
        sheets_service.spreadsheets().values().append(
            spreadsheetId=spreadsheet_id,
            range=range_name,
            valueInputOption="RAW",
            insertDataOption="INSERT_ROWS",
            body={"values": new_rows}
        ).execute()
        return {"updated": True, "rows_written": len(new_rows)}
    except HttpError as error:
        raise HTTPException(status_code=500, detail=f"Failed to append emails: {error}")

async def perform_incremental_sync(user: User, db: Session):
    """Fetch Gmail messages, filter out already synced email IDs, and append new ones to the Google Sheet."""
    if not user.is_setup_completed or not user.spreadsheet_id:
        raise HTTPException(status_code=400, detail="Setup must be completed before sync.")

    try:
        # 1. Fetch recent emails from Gmail
        fetch_result = fetch_user_emails(user, max_results=DEFAULT_EMAIL_FETCH_LIMIT)
        emails = fetch_result.get("emails", [])

        if not emails:
            sync_metadata = _mark_sync_success(user, db)
            return {
                "status": "success",
                "new_rows": 0,
                "message": "No emails found in Gmail.",
                **sync_metadata,
            }

        # 2. Get existing Email IDs from Google Sheet Column A
        credentials = build_credentials(user)
        sheets_service = build("sheets", "v4", credentials=credentials)
        sheet_title = "Sheet1"

        try:
            sheet_title = _get_sheet_title(sheets_service, user.spreadsheet_id)
            
            result = sheets_service.spreadsheets().values().get(
                spreadsheetId=user.spreadsheet_id,
                range=f"'{sheet_title}'!A2:A"
            ).execute()
            existing_ids = {row[0] for row in result.get("values", []) if row}
        except Exception as e:
            print(f"Failed to read existing sheet rows: {e}")
            existing_ids = set()

        # 3. Filter for new emails only
        new_emails = [e for e in emails if e.get("id") not in existing_ids]

        if not new_emails:
            sync_metadata = _mark_sync_success(user, db, emails)
            return {
                "status": "success",
                "new_rows": 0,
                "message": "Dashboard is already up to date!",
                **sync_metadata,
            }

        # 4. Parse and append to the sheet
        new_rows = parse_emails_for_sheet(new_emails)
        sync_result = await append_sheet_with_emails(user, user.spreadsheet_id, sheet_title, new_rows)
        sync_metadata = _mark_sync_success(user, db, emails)

        return {
            "status": "success",
            "new_rows": sync_result.get("rows_written", 0),
            "message": f"Successfully synced {sync_result.get('rows_written')} new emails!",
            **sync_metadata,
        }
    except Exception:
        _mark_sync_failed(user, db)
        raise

        
