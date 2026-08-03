import asyncio
import threading
from datetime import datetime, timezone

from fastapi import UploadFile, HTTPException
from googleapiclient.discovery import build
from pathlib import Path
import hashlib
import re
from uuid import uuid4
from typing import List
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..core.constants import UPLOAD_DIR
from ..database import SessionLocal
from ..models.user import User
from ..services.credentials import build_credentials
from ..utils.db_utils import (
    save_valid_transaction_to_db,
    update_parsed_status_to_db,
)
from ..utils.sheets_utils import _get_sheet_title
from .setup_service import _sync_transactions_to_sheet


STATEMENT_JOB_RUNNING = "running"
STATEMENT_JOB_SUCCESS = "success"
STATEMENT_JOB_FAILED = "failed"

_statement_jobs: dict[str, dict] = {}
_statement_jobs_lock = threading.Lock()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _set_statement_job(job_key: str, **updates) -> None:
    with _statement_jobs_lock:
        current_job = _statement_jobs.get(job_key, {})
        _statement_jobs[job_key] = {
            **current_job,
            **updates,
            "updated_at": _utc_now_iso(),
        }


def get_statement_upload_job(user_id: int, job_id: str) -> dict:
    with _statement_jobs_lock:
        job = _statement_jobs.get(job_id)
        if not job or job.get("user_id") != user_id:
            raise HTTPException(status_code=404, detail="Statement upload job not found.")
        return dict(job)


# -------------------------- Main function which calls LLM ------------
def _parse_statement_pdf_sync(pdf_path: Path, user_id: int, original_filename: str) -> list[dict]:
    """Parse a statement PDF through the shared LLM statement function.

    original_filename (the name the user uploaded, before _safe_upload_name
    renamed it to a UUID'd path) is passed through so the account-number
    lookup — used to resolve passwords for encrypted statements — can read
    the last-4 digits embedded in it.
    """
    try:
        from ..ds.llm.main import process_statement
    except ModuleNotFoundError as error:
        missing_dependency = error.name or "PDF extraction dependency"
        raise HTTPException(
            status_code=500,
            detail=(
                f"Statement PDF extraction dependency missing: {missing_dependency}. "
                "Install backend PDF LLM dependencies from requirements.txt."
            ),
        ) from error

    return asyncio.run(
        process_statement(
            file_path=str(pdf_path),
            user_id=user_id,
            original_filename=original_filename,
        )
    )


# --------------------------- Helper function -------------------------
def _safe_upload_name(filename: str | None, index: int) -> str:
    """ Generate filename with uuid to prevent collisions """

    original_name = (filename or f"statement_{index}.pdf").replace("\\", "/").split("/")[-1]
    path = Path(original_name)
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "_", path.stem).strip("._") or f"statement_{index}"
    suffix = path.suffix.lower() or ".pdf"
    return f"{stem}_{uuid4().hex}{suffix}"


def _fallback_reference(transaction: dict) -> str:
    """ Create fallback reference number"""
    raw_key = "|".join(
        str(transaction.get(field) or "").strip()
        for field in (
            "bank_name",
            "account_number",
            "txn_date",
            "txn_type",
            "amount",
            "balance_after_txn",
            "narration",
        )
    )
    return f"stmt_{hashlib.sha256(raw_key.encode('utf-8')).hexdigest()[:20]}"


def _normalize_statement_transaction(transaction: dict, source_file: str) -> dict:
    """ Makes statement parser output look like a parsed transaction."""

    normalized = dict(transaction or {})
    ref_number = str(normalized.get("ref_number") or "").strip() or _fallback_reference(normalized)
    parser_metadata = normalized.get("parser_metadata") or {}
    optional_fields = normalized.get("optional_fields") or None

    # If parser_metadata is a Pydantic model, it converts it to a dictionary
    if hasattr(parser_metadata, "model_dump"):
        parser_metadata = parser_metadata.model_dump()

    parser_metadata = {
        **(parser_metadata if isinstance(parser_metadata, dict) else {}),
        "parsed_status": "parsed",
        "source_file": source_file,
    }

    normalized["ref_number"] = ref_number
    normalized.setdefault("gmail_message_id", None)
    normalized["source"] = "statement"
    normalized.setdefault("email_metadata", None)
    normalized["parser_metadata"] = parser_metadata
    normalized["optional_fields"] = optional_fields


    return normalized


async def _save_uploaded_statements(files: List[UploadFile]) -> list[tuple[str, Path]]:
    """ """
    await run_in_threadpool(UPLOAD_DIR.mkdir, parents=True, exist_ok=True)
    saved_files: list[tuple[str, Path]] = []

    try:
        # Process every uploaded files
        for index, file in enumerate(files, start=1):
            suffix = Path(file.filename or "").suffix.lower()

            # Rejects non-pdf files
            if suffix != ".pdf":
                raise HTTPException(
                    status_code=400,
                    detail=f"Only PDF statements are supported: {file.filename or 'unnamed file'}",
                )

            content = await file.read()

            # Check for an empty pdf
            if not content:
                raise HTTPException(
                    status_code=400,
                    detail=f"Uploaded statement is empty: {file.filename or 'unnamed file'}",
                )

            saved_path = UPLOAD_DIR / _safe_upload_name(file.filename, index)
            await run_in_threadpool(saved_path.write_bytes, content)
            saved_files.append((file.filename or saved_path.name, saved_path))
    except Exception:
        _delete_saved_statements(saved_files)
        raise

    return saved_files


def _delete_saved_statement(saved_path: Path) -> None:
    """ Delete the temporary files after processing """
    try:
        if saved_path.exists():
            saved_path.unlink()
    except OSError as error:
        print(f"Failed to delete temporary statement file {saved_path}: {error}")


def _delete_saved_statements(saved_files: list[tuple[str, Path]]) -> None:
    for _, saved_path in saved_files:
        _delete_saved_statement(saved_path)


def _statement_error_message(error: Exception) -> str:
    if isinstance(error, HTTPException):
        return str(error.detail)
    return str(error) or "Statement parsing failed."


def _run_statement_upload_job(job_id: str, user_id: int, saved_files: list[tuple[str, Path]]) -> None:
    try:
        result = _process_saved_statements_sync(user_id, saved_files)
        _set_statement_job(
            job_id,
            status=STATEMENT_JOB_SUCCESS,
            message=result.get("message") or "Statement parsing completed.",
            result=result,
            completed_at=_utc_now_iso(),
        )
    except Exception as error:
        _delete_saved_statements(saved_files)
        _set_statement_job(
            job_id,
            status=STATEMENT_JOB_FAILED,
            message=_statement_error_message(error),
            error=_statement_error_message(error),
            completed_at=_utc_now_iso(),
        )


def _start_statement_job_thread(job_id: str, user_id: int, saved_files: list[tuple[str, Path]]) -> None:
    thread = threading.Thread(
        target=_run_statement_upload_job,
        args=(job_id, user_id, saved_files),
        daemon=True,
        name=f"statement-upload-{job_id}",
    )
    thread.start()








def _process_saved_statements_sync(user_id: int, saved_files: list[tuple[str, Path]]) -> dict:
    """
    Blocking statement pipeline. It runs in a worker thread so PDF rendering,
    LLM calls, Google Sheets calls, and DB commits do not block FastAPI's event loop.
    """
    db = SessionLocal()

    try:
        user = db.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        if not user.spreadsheet_id:
            raise HTTPException(status_code=400, detail="Google spreadsheet setup not completed.")

        # 2. Connect to Google Sheets client using user's OAuth credentials
        credentials = build_credentials(user)
        sheets_service = build("sheets", "v4", credentials=credentials)
        sheet_title = _get_sheet_title(sheets_service, user.spreadsheet_id)
    except Exception as e:
        for _, saved_path in saved_files:
            _delete_saved_statement(saved_path)
        db.close()
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=500, detail=f"Failed to connect to Google Sheets or database: {str(e)}")

    all_extracted_txns = []             # Stores all transactions processed across all PDFs
    total_rows_written = 0              # Tracks how many rows were added to Google Sheets.
    total_duplicates_skipped = 0        # Rows that matched an existing transaction with no new data.
    total_flagged_for_review = 0        # Rows saved but flagged as low-confidence/incomplete.
    processed_files = []                # Stores per-file summary information.

    # 4. Iterate and process saved statement PDFs one-by-one
    for original_filename, saved_path in saved_files:
        try:
            # 5. Parse statement PDF using app.ds.llm.app.run(Path)
            extracted_txns = _parse_statement_pdf_sync(saved_path, user.id, original_filename)
            print(
                "Statement parsed: "
                f"user={user.id} file={original_filename} rows={len(extracted_txns or [])}"
            )
            if not extracted_txns:
                processed_files.append({
                    "filename": original_filename,
                    "stored_path": str(saved_path),
                    "transactions_found": 0,
                    "rows_written": 0,
                    "duplicates_skipped": 0,
                    "flagged_for_review": 0,
                })
                continue

            # 6. Normalize every statement row and let the DB upsert layer handle
            # ref-number matching first, with dedupe-key matching as fallback.
            statement_txns = [
                _normalize_statement_transaction(txn, original_filename)
                for txn in extracted_txns
            ]

            if not statement_txns:
                print(
                    "Statement DB: "
                    f"user={user.id} file={original_filename} "
                    f"transactions_saved=0"
                )
                processed_files.append({
                    "filename": original_filename,
                    "stored_path": str(saved_path),
                    "transactions_found": len(extracted_txns),
                    "rows_written": 0,
                    "duplicates_skipped": 0,
                    "flagged_for_review": 0,
                })
                continue
            
            # 7. Add normalized transactions to overall list
            all_extracted_txns.extend(statement_txns)

            try:
                # 8. Add/update parsed transactions in DB.
                saved_transactions = save_valid_transaction_to_db(statement_txns, user.id, db)
                update_parsed_status_to_db(user.id, statement_txns, db)
                db.commit()

                # Only rows that are actually new information -- a brand-new
                # row, or a merge that filled in previously-missing fields --
                # count as "saved". A merge that matched an existing row and
                # changed nothing is a pure duplicate and is excluded.
                new_transactions = [
                    txn for txn in saved_transactions
                    if getattr(txn, "_is_insert", False) or getattr(txn, "_has_new_data", False)
                ]
                duplicates_skipped = len(saved_transactions) - len(new_transactions)
                flagged_for_review = sum(1 for txn in saved_transactions if txn.is_flag)

                print(
                    "Statement DB: "
                    f"user={user.id} file={original_filename} "
                    f"parsed_valid={len(statement_txns)} "
                    f"transactions_saved={len(new_transactions)} "
                    f"duplicates_skipped={duplicates_skipped} "
                    f"flagged_for_review={flagged_for_review}"
                )
            except Exception as e:
                db.rollback()
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed saving statement transactions for '{original_filename}': {str(e)}"
                )

            total_duplicates_skipped += duplicates_skipped
            total_flagged_for_review += flagged_for_review

            # 9. Add newly saved unsynced transactions to the sheets.
            sync_result = _sync_transactions_to_sheet(
                user,
                db,
                sheets_service=sheets_service,
                sheet_title=sheet_title,
                transaction_ids=[transaction.id for transaction in saved_transactions],
            )
            rows_written = sync_result.get("rows_written", 0)
            total_rows_written += rows_written
            print(
                "Statement sheet sync: "
                f"user={user.id} file={original_filename} rows_written={rows_written}"
            )

            processed_files.append({
                "filename": original_filename,
                "stored_path": str(saved_path),
                "transactions_found": len(extracted_txns),
                "rows_written": rows_written,
                "duplicates_skipped": duplicates_skipped,
                "flagged_for_review": flagged_for_review,
            })
                
        except HTTPException:
            # Re-raise HTTP exceptions to propagate cleaner API error codes
            _delete_saved_statements(saved_files)
            db.close()
            raise
        except Exception as e:
            # Fallback error wrapper for unexpected process-interrupts
            _delete_saved_statements(saved_files)
            db.close()
            raise HTTPException(
                status_code=500,
                detail=f"Failed processing statement '{original_filename}': {str(e)}"
            )
        finally:
            _delete_saved_statement(saved_path)

    try:
        return {
            "status": "success",
            "message": f"Successfully parsed and appended {total_rows_written} transactions from {len(saved_files)} files.",
            "transactions_count": len(all_extracted_txns),
            "rows_written": total_rows_written,
            "duplicates_skipped": total_duplicates_skipped,
            "flagged_for_review": total_flagged_for_review,
            "files": processed_files,
        }
    finally:
        db.close()


# --------------------------- Main orchestrator function -----------------
async def process_and_upload_statements(user: User, files: List[UploadFile], db: Session) -> dict:
    """
    Service to process uploaded bank statement files.
    Saves files, invokes the PDF LLM parser sequentially for each statement,
    saves extracted transactions into DB, then projects unsynced rows to Google Sheets.
    """

    if not files:
        raise HTTPException(status_code=400, detail="No statement files uploaded.")

    if not user.spreadsheet_id:
        raise HTTPException(status_code=400, detail="Google spreadsheet setup not completed.")

    saved_files = await _save_uploaded_statements(files)
    job_id = uuid4().hex
    filenames = [original_filename for original_filename, _ in saved_files]

    _set_statement_job(
        job_id,
        job_id=job_id,
        user_id=user.id,
        status=STATEMENT_JOB_RUNNING,
        message="Statement parsing is running.",
        filenames=filenames,
        started_at=_utc_now_iso(),
    )

    try:
        _start_statement_job_thread(job_id, user.id, saved_files)
    except Exception:
        _delete_saved_statements(saved_files)
        _set_statement_job(
            job_id,
            status=STATEMENT_JOB_FAILED,
            message="Failed to start statement parsing.",
            completed_at=_utc_now_iso(),
        )
        raise HTTPException(status_code=500, detail="Failed to start statement parsing.")

    return {
        "status": STATEMENT_JOB_RUNNING,
        "job_id": job_id,
        "message": "Statement upload started. Parsing will continue in the background.",
        "files_count": len(saved_files),
        "filenames": filenames,
    }
