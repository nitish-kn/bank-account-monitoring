import asyncio
import logging
from dataclasses import dataclass
from datetime import timedelta
from threading import Thread
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from itertools import zip_longest
from pathlib import Path
import re
import time
from typing import Callable
from uuid import uuid4

from fastapi import HTTPException
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session

from ..core.constants import (
    EMAIL_EXTRACTION_BATCH_SIZE,
    FAILED_STATUS,
    PDF_MIME_TYPE,
    REQUIRED_SCHEMA,
    SHEET_NAME,
    STATEMENT_ATTACHMENT_KEYWORDS,
    SYNC_MAX_PARALLEL_JOBS,
    SYNC_STATUS_COMPLETED,
    SYNC_STATUS_FAILED,
    SYNC_STATUS_RUNNING,
    SYNC_TIMEOUT_SECONDS,
    TRANSACTION_DATA_RANGE,
    TRANSACTION_HEADER_RANGE,
    UPLOAD_DIR,
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
    fetch_gmail_attachment_bytes,
    get_latest_gmail_message_id,
    hydrate_user_message_page,
    iter_user_message_pages,
)
from .ledger_service import recalculate_ledgers_for_transactions


from ..utils.sheets_utils import _get_sheet_title, _append_sheet_rows, _read_existing_column_values
from ..utils.statement_utils import normalize_statement_transaction, parse_statement_pdf_sync
from ..utils.transaction_utils import (
    transactions_to_sheet_rows,
    transaction_column_for_field,
)
from ..ds.llm.main import process_emails

logger = logging.getLogger(__name__)

# Thread tracking for stuck-sync detection
# Maps user_id -> {"thread": Thread, "started_at": float (time.time())}
_active_sync_threads: dict[int, dict] = {}


@dataclass(frozen=True)
class SyncUserSnapshot:
    id: int
    access_token: str | None
    refresh_token: str | None
    token_expiry: object | None


def _snapshot_sync_user(user: User) -> SyncUserSnapshot:
    return SyncUserSnapshot(
        id=user.id,
        access_token=user.access_token,
        refresh_token=user.refresh_token,
        token_expiry=user.token_expiry,
    )


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
        logger.error("Failed to update sync failure metadata | error=%s", _safe_error_text(error))


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
        logger.warning(
            "Sync thread stuck | user=%s elapsed_s=%.0f timeout_s=%s",
            user_id, elapsed, SYNC_TIMEOUT_SECONDS,
        )
        _active_sync_threads.pop(user_id, None)
        return False

    return True




def _safe_error_text(error: Exception) -> str:
    return str(error).encode("ascii", "replace").decode("ascii")


def _parsed_transaction_count(transactions: list[dict]) -> int:
    return sum(
        1
        for transaction in transactions or []
        if str(
            (transaction.get("parser_metadata") or {}).get("parsed_status") or ""
        ).strip().lower() == "parsed"
    )


def _text_contains_statement_keyword(*values) -> bool:
    text = " ".join(str(value or "").lower() for value in values)
    return any(keyword.lower() in text for keyword in STATEMENT_ATTACHMENT_KEYWORDS)


def _pdf_attachments_for_email(email: dict) -> list[dict]:
    pdf_attachments = []

    for attachment in email.get("attachments") or []:
        filename = str(attachment.get("filename") or "")
        mime_type = str(
            attachment.get("mimeType")
            or attachment.get("mime_type")
            or ""
        ).lower()

        if filename.lower().endswith(".pdf") or mime_type == PDF_MIME_TYPE:
            pdf_attachments.append(attachment)

    return pdf_attachments


def _split_statement_attachment_emails(emails: list[dict]) -> tuple[list[dict], list[dict]]:
    statement_emails = []
    normal_emails = []
    keyword_but_no_pdf = 0
    pdf_but_no_keyword = 0

    for email in emails:
        has_keyword = _text_contains_statement_keyword(email.get("subject"), email.get("snippet"))
        pdf_attachments = _pdf_attachments_for_email(email)

        if has_keyword and pdf_attachments:
            statement_emails.append(email)
            logger.info(
                "Statement route matched | gmail_message_id=%s subject=%r pdf_count=%d filenames=%s",
                email.get("id"), email.get("subject"), len(pdf_attachments),
                [a.get("filename") for a in pdf_attachments],
            )
        else:
            normal_emails.append(email)
            if has_keyword and not pdf_attachments:
                keyword_but_no_pdf += 1
            elif pdf_attachments and not has_keyword:
                # Has a real PDF attachment but subject/snippet wording didn't
                # match — falls through to the text pipeline, which can't
                # read the PDF. Logged so this silent gap is at least visible.
                pdf_but_no_keyword += 1

    if keyword_but_no_pdf or pdf_but_no_keyword:
        logger.info(
            "Statement route skipped | keyword_but_no_pdf=%d pdf_but_no_keyword_match=%d",
            keyword_but_no_pdf, pdf_but_no_keyword,
        )

    return statement_emails, normal_emails


def _attachment_temp_path(email: dict, attachment: dict, index: int) -> Path:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    email_id = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(email.get("id") or "message"))
    original_name = Path(attachment.get("filename") or f"statement_{index}.pdf").name
    original_path = Path(original_name)
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "_", original_path.stem).strip("._") or f"statement_{index}"

    return UPLOAD_DIR / f"gmail_{email_id}_{stem}_{uuid4().hex}.pdf"


def _attachment_email_metadata(email: dict, attachment: dict) -> dict:
    return {
        "original_from_email": email.get("from"),
        "subject": email.get("subject"),
        "body": email.get("body"),
        "attachments": [attachment],
    }


def _parse_statement_attachments_from_email(user: User, email: dict) -> tuple[list[dict], list[str]]:
    transactions = []
    errors = []
    message_id = email.get("id")
    pdf_attachments = _pdf_attachments_for_email(email)

    if pdf_attachments:
        logger.info(
            "Statement attachments found | user=%s gmail_message_id=%s count=%d filenames=%s",
            user.id, message_id, len(pdf_attachments),
            [a.get("filename") for a in pdf_attachments],
        )

    for index, attachment in enumerate(pdf_attachments, start=1):
        attachment_id = attachment.get("id")
        filename = attachment.get("filename") or f"statement_{index}.pdf"
        saved_path = None

        if not message_id or not attachment_id:
            errors.append("Missing Gmail message ID or attachment ID.")
            logger.warning(
                "Statement attachment skipped, no message or attachment id | user=%s file=%s",
                user.id, filename,
            )
            continue

        try:
            logger.info(
                "Statement attachment downloading | user=%s gmail_message_id=%s file=%s reported_size_bytes=%s",
                user.id, message_id, filename, attachment.get("size"),
            )
            file_bytes = fetch_gmail_attachment_bytes(user, message_id, attachment_id)
            if not file_bytes:
                raise RuntimeError("Gmail attachment was empty.")

            saved_path = _attachment_temp_path(email, attachment, index)
            saved_path.write_bytes(file_bytes)
            logger.info(
                "Statement attachment saved | user=%s gmail_message_id=%s file=%s bytes=%d temp_path=%s",
                user.id, message_id, filename, len(file_bytes), saved_path,
            )

            extracted_txns = parse_statement_pdf_sync(
                saved_path,
                user.id,
                original_filename=str(filename),
            )
            normalized_txns = [
                normalize_statement_transaction(
                    transaction,
                    str(filename),
                    gmail_message_id=message_id,
                    email_metadata=_attachment_email_metadata(email, attachment),
                )
                for transaction in extracted_txns or []
            ]
            transactions.extend(normalized_txns)
            logger.info(
                "Statement attachment parsed | user=%s gmail_message_id=%s file=%s rows=%d",
                user.id, message_id, filename, len(normalized_txns),
            )
        except HTTPException as error:
            # process_statement raises 422 specifically when the PDF is
            # password-protected and no password could be resolved/verified
            # (explicit password / email-body guess / filename guess all
            # failed) — flagged distinctly so it's not confused with a
            # generic parsing failure when scanning logs.
            needs_password = getattr(error, "status_code", None) == 422
            safe_error = str(error.detail).encode("ascii", "replace").decode("ascii")
            errors.append(safe_error)
            logger.warning(
                "Statement attachment %s | user=%s gmail_message_id=%s file=%s error=%s",
                "needs password" if needs_password else "failed",
                user.id, message_id, filename, safe_error[:200],
            )
        except Exception as error:
            # Unexpected (not a known password/parsing failure) — error level
            # so it stands out from the expected "needs password" case above.
            safe_error = _safe_error_text(error)
            errors.append(safe_error)
            logger.error(
                "Statement attachment failed unexpectedly | user=%s gmail_message_id=%s file=%s error=%s",
                user.id, message_id, filename, safe_error[:200],
            )
        finally:
            if saved_path:
                try:
                    saved_path.unlink(missing_ok=True)
                except OSError as error:
                    logger.error(
                        "Failed to delete temp statement file | temp_path=%s error=%s",
                        saved_path, error,
                    )

    return transactions, errors


def _persist_extracted_transactions(
    user: User,
    db: Session,
    sheets_service,
    sheet_title: str,
    emails: list[dict],
    transactions: list[dict],
    log_label: str,
    force_status: str | None = None,
    force_status_reason: str | None = None,
) -> list:
    """Save extracted transactions, then upsert the parse-status row for each
    of `emails`. `force_status`, if given, pins that status regardless of
    what parser_metadata says on `transactions` — used when the caller
    already knows the outcome should read as failed (e.g. a statement email
    with a partially or fully unrecoverable attachment) even though some
    transactions from it are still being saved."""
    try:
        parsed_result_count = _parsed_transaction_count(transactions)
        saved_transactions = save_valid_transaction_to_db(
            transactions,
            user.id,
            db,
        )

        update_parsed_status_to_db(
            user.id,
            transactions,
            db,
            emails=emails,
            error=force_status_reason,
            force_status=force_status,
        )

        ledger_result = recalculate_ledgers_for_transactions(
            db,
            saved_transactions,
            user.id,
        )

        db.add(user)
        db.commit()
        logger.info(
            "%s saved | user=%s emails=%d llm_rows=%d parsed=%d transactions_saved=%d ledger_rows=%d forced_status=%s",
            log_label, user.id, len(emails), len(transactions), parsed_result_count,
            len(saved_transactions), ledger_result.get("accounts_recalculated", 0), force_status,
        )
    except Exception as error:
        db.rollback()
        safe_error = _safe_error_text(error)
        logger.error("Failed to persist %s | error=%s", log_label.lower(), safe_error[:300])
        update_parsed_status_to_db(
            user.id,
            [],
            db,
            emails=emails,
            error=safe_error,
        )
        db.add(user)
        db.commit()
        return []

    if saved_transactions:
        _sync_transactions_to_sheet(
            user,
            db,
            sheets_service=sheets_service,
            sheet_title=sheet_title,
            transaction_ids=[transaction.id for transaction in saved_transactions],
        )

    return saved_transactions


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
            logger.info(
                "Sync page | user=%s page=%d/%d gmail_ids=%d already_parsed=%d new=%d",
                user_id, page_idx, total_pages, len(message_page), already_parsed_count, len(new_messages),
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
            logger.info(
                "Sync hydrate | user=%s requested=%d hydrated=%d failed=%d",
                user_id, len(new_messages), len(new_emails), len(missing_hydrated_messages),
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

            logger.info(
                "Sync page emails ready | user=%s page=%d/%d count=%d",
                user_id, page_idx, total_pages, len(new_emails),
            )

            statement_emails, email_parser_emails = _split_statement_attachment_emails(new_emails)
            logger.info(
                "Email route | user=%s page=%d/%d statement_pdf_emails=%d normal_email_parser=%d",
                user_id, page_idx, total_pages, len(statement_emails), len(email_parser_emails),
            )

            # 7. Extract transactions from statement PDFs and normal emails
            # concurrently instead of one phase fully draining before the
            # other starts — a slow statement PDF no longer blocks the
            # (usually much faster) normal emails queued behind it. Every
            # job below only does the extraction call (Gmail fetch / LLM);
            # this loop is the single place that writes to `db`/`sheets_service`,
            # so persistence always happens through one session.
            jobs = _build_extraction_jobs(_snapshot_sync_user(user), statement_emails, email_parser_emails)
            job_counts: dict[str, int] = {}

            for result in _run_extraction_jobs(jobs, max_workers=SYNC_MAX_PARALLEL_JOBS):
                job_emails = result["emails"]
                job_error = result["error"]
                job_counts[result["label"]] = job_counts.get(result["label"], 0) + 1

                if job_error:
                    logger.warning(
                        "%s failed | user=%s emails=%d error=%s",
                        result["label"], user_id, len(job_emails), job_error[:300],
                    )
                    update_parsed_status_to_db(user_id, [], db, emails=job_emails, error=job_error)
                    db.add(user)
                    db.commit()
                else:
                    forced_status = result.get("forced_status")
                    if forced_status:
                        logger.warning(
                            "%s flagged failed | user=%s gmail_message_id=%s reason=%s",
                            result["label"], user_id,
                            job_emails[0].get("id") if job_emails else None,
                            result.get("forced_status_reason"),
                        )
                    _persist_extracted_transactions(
                        user, db, sheets_service, sheet_title,
                        job_emails, result["transactions"], result["label"],
                        force_status=forced_status,
                        force_status_reason=result.get("forced_status_reason"),
                    )

                existing_gmail_message_ids.update(
                    email.get("id") for email in job_emails if email.get("id")
                )

            if job_counts:
                logger.info(
                    "Extraction summary | user=%s page=%d/%d %s",
                    user_id, page_idx, total_pages,
                    " ".join(f"{label}={count}" for label, count in job_counts.items()),
                )

        _mark_sync_success(user, db)
    except Exception as error:
        logger.error("Background sync failed | user=%s error=%s", user_id, _safe_error_text(error)[:300])
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
            logger.warning("Sync marked running with no active thread, resetting | user=%s", user.id)
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


def _statement_job_result(
    email: dict,
    transactions: list[dict],
    label: str,
    forced_status: str | None = None,
    forced_status_reason: str | None = None,
) -> dict:
    return {
        "emails": [email],
        "transactions": transactions,
        "label": label,
        "error": None,
        "forced_status": forced_status,
        "forced_status_reason": forced_status_reason,
    }


def _extract_transactions_for_statement_email(user: SyncUserSnapshot, email: dict) -> dict:
    """Extraction job for one statement email: parse its PDF attachment(s).

    - All attachments parse cleanly -> normal "Statement attachment" result.
    - Some parsed, some didn't (e.g. one of two PDFs was locked) -> the
      successful transactions are still returned to be saved, but the job
      is marked forced_status=FAILED_STATUS so the parse-status row reflects
      the problem instead of being masked by the partial success.
    - None parsed at all (e.g. password couldn't be cracked) -> falls back
      to the normal text-extraction pipeline in case the email body itself
      has something usable, but the message is still pinned to
      forced_status=FAILED_STATUS either way, so an unresolved password
      doesn't get buried under a coincidental "not_transaction" verdict
      from that fallback scan.
    """
    transactions, attachment_errors = _parse_statement_attachments_from_email(user, email)

    if transactions and not attachment_errors:
        return _statement_job_result(email, transactions, "Statement attachment")

    total_attachments = len(_pdf_attachments_for_email(email))
    reason = (
        f"{len(attachment_errors)}/{total_attachments} statement attachment(s) failed: "
        + "; ".join(attachment_errors[:3])
    )

    if transactions:
        # Partial failure: keep what parsed, but flag the whole email.
        return _statement_job_result(email, transactions, "Statement attachment", FAILED_STATUS, reason)

    logger.info(
        "Statement fallback to email pipeline | gmail_message_id=%s attachment_errors=%d errors=%s",
        email.get("id"), len(attachment_errors), attachment_errors[:3],
    )
    try:
        fallback_transactions = asyncio.run(process_emails([email], user_id=user.id)) or []
    except Exception as error:
        fallback_transactions = []
        reason = _safe_error_text(error)

    return _statement_job_result(email, fallback_transactions, "Statement fallback", FAILED_STATUS, reason)


def _extract_transactions_for_email_batch(batch: list[dict], user_id: int | None) -> dict:
    """Extraction job for one batch of normal (non-statement) emails: a
    single LLM call covering all of them."""
    try:
        result = asyncio.run(process_emails(batch, user_id=user_id))

        if result is None:
            return {"emails": batch, "transactions": [], "label": "Email batch", "error": "LLM extractor returned no response."}

        if not isinstance(result, list):
            return {
                "emails": batch,
                "transactions": [],
                "label": "Email batch",
                "error": f"LLM extractor returned {type(result).__name__} instead of list.",
            }

        return {"emails": batch, "transactions": result, "label": "Email batch", "error": None}
    except Exception as error:
        return {"emails": batch, "transactions": [], "label": "Email batch", "error": _safe_error_text(error)}


def _build_extraction_jobs(
    user: SyncUserSnapshot,
    statement_emails: list[dict],
    normal_emails: list[dict],
    batch_size: int = EMAIL_EXTRACTION_BATCH_SIZE,
) -> list[Callable[[], dict]]:
    """Build one zero-arg job per statement email and one per batch of
    normal emails, so both kinds can be submitted to the same worker pool
    and run side by side instead of one phase blocking the other."""
    statement_jobs = [
        (lambda statement_email=statement_email: _extract_transactions_for_statement_email(user, statement_email))
        for statement_email in statement_emails
    ]
    email_batches = [
        normal_emails[i:i + batch_size]
        for i in range(0, len(normal_emails), batch_size)
    ]
    user_id = user.id
    batch_jobs = [
        (lambda batch=batch: _extract_transactions_for_email_batch(batch, user_id))
        for batch in email_batches
    ]

    # Email batches first, statement PDFs second, then interleaved one-for-one: with
    # max_workers=4 this hands out roughly 2 workers to each kind up front, instead of
    # every statement job (slow: password guessing + multi-page vision LLM calls) queuing
    # ahead of every email batch and starving it of a worker. Once one kind runs out,
    # the leftover jobs of the other kind keep the now-free workers busy.
    return [
        job
        for pair in zip_longest(batch_jobs, statement_jobs)
        for job in pair
        if job is not None
    ]


def _run_extraction_jobs(jobs: list[Callable[[], dict]], max_workers: int):
    """Run extraction jobs (statement-PDF or email-batch, mixed freely)
    concurrently and yield each job's result as soon as it completes.
    Jobs must only do extraction (Gmail fetch / LLM call) — the thread
    consuming this generator is the sole place that should touch
    `db`/`sheets_service`, so all persistence stays on one session."""
    if not jobs:
        return

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        pending = {executor.submit(job) for job in jobs}
        while pending:
            done, pending = wait(pending, return_when=FIRST_COMPLETED)
            for future in done:
                try:
                    yield future.result()
                except Exception as error:
                    yield {"emails": [], "transactions": [], "label": "Extraction job", "error": _safe_error_text(error)}



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
            logger.warning("Incremental sync marked running with no active thread, resetting | user=%s", user.id)
            _mark_sync_failed(user, db)
            db.refresh(user)

    # Fetch the single latest email ID from Gmail and check if it already exists in DB.
    try:
        latest_gmail_id = get_latest_gmail_message_id(user)
        if latest_gmail_id:
            existing_gmail_message_ids = check_existing_gmail_message_id(user, db)
            
            if latest_gmail_id in existing_gmail_message_ids:
                logger.info(
                    "Incremental sync up to date | user=%s known_gmail_ids=%d",
                    user.id, len(existing_gmail_message_ids),
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
        logger.warning(
            "Latest email check failed, falling back to full sync | error=%s",
            _safe_error_text(e)[:300],
        )

    return start_background_sync_for_user(user, db)

