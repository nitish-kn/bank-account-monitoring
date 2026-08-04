import threading
from datetime import datetime, timezone

from fastapi import UploadFile, HTTPException
from googleapiclient.discovery import build
from pathlib import Path
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
from ..utils.statement_utils import (
    normalize_statement_transaction,
    parse_statement_pdf_sync,
)
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


# --------------------------- Helper function -------------------------
def _safe_upload_name(filename: str | None, index: int) -> str:
    """ Generate filename with uuid to prevent collisions """

    original_name = (filename or f"statement_{index}.pdf").replace("\\", "/").split("/")[-1]
    path = Path(original_name)
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "_", path.stem).strip("._") or f"statement_{index}"
    suffix = path.suffix.lower() or ".pdf"
    return f"{stem}_{uuid4().hex}{suffix}"


async def _save_uploaded_statements(
    files: List[UploadFile],
    password: str | None = None,
) -> list[tuple[str, Path, str | None]]:
    """ `password`, if given, comes from the frontend's "this PDF needs a
    password" popup — the retry request it sends carries just the one file
    that failed plus this one password, so no per-file list is needed. """
    await run_in_threadpool(UPLOAD_DIR.mkdir, parents=True, exist_ok=True)
    saved_files: list[tuple[str, Path, str | None]] = []

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
            saved_files.append((file.filename or saved_path.name, saved_path, password))
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


def _delete_saved_statements(saved_files: list[tuple[str, Path, str | None]]) -> None:
    for _, saved_path, _password in saved_files:
        _delete_saved_statement(saved_path)


def _statement_error_message(error: Exception) -> str:
    if isinstance(error, HTTPException):
        return str(error.detail)
    return str(error) or "Statement parsing failed."


def _run_statement_upload_job(job_id: str, user_id: int, saved_files: list[tuple[str, Path, str | None]]) -> None:
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


def _start_statement_job_thread(job_id: str, user_id: int, saved_files: list[tuple[str, Path, str | None]]) -> None:
    thread = threading.Thread(
        target=_run_statement_upload_job,
        args=(job_id, user_id, saved_files),
        daemon=True,
        name=f"statement-upload-{job_id}",
    )
    thread.start()








def _process_saved_statements_sync(user_id: int, saved_files: list[tuple[str, Path, str | None]]) -> dict:
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
        for _, saved_path, _password in saved_files:
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

    # 4. Iterate and process saved statement PDFs one-by-one. Each file is
    # isolated — a locked or otherwise failing PDF is recorded and skipped
    # rather than aborting the rest of the batch.
    for original_filename, saved_path, password in saved_files:
        file_result = {
            "filename": original_filename,
            "stored_path": str(saved_path),
            "status": "success",
            "needs_password": False,
            "error": None,
            "transactions_found": 0,
            "rows_written": 0,
            "duplicates_skipped": 0,
            "flagged_for_review": 0,
        }

        try:
            # 5. Parse statement PDF using app.ds.llm.app.run(Path)
            extracted_txns = parse_statement_pdf_sync(
                saved_path,
                user.id,
                original_filename=original_filename,
                password=password,
            )
            print(
                "Statement parsed: "
                f"user={user.id} file={original_filename} rows={len(extracted_txns or [])}"
            )
            if not extracted_txns:
                file_result["status"] = "no_transactions_found"
                processed_files.append(file_result)
                continue

            # 6. Normalize every statement row and let the DB upsert layer handle
            # ref-number matching first, with dedupe-key matching as fallback.
            statement_txns = [
                normalize_statement_transaction(txn, original_filename)
                for txn in extracted_txns
            ]
            file_result["transactions_found"] = len(extracted_txns)

            if not statement_txns:
                print(
                    "Statement DB: "
                    f"user={user.id} file={original_filename} "
                    f"transactions_saved=0"
                )
                file_result["status"] = "no_transactions_found"
                processed_files.append(file_result)
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

            file_result.update({
                "rows_written": rows_written,
                "duplicates_skipped": duplicates_skipped,
                "flagged_for_review": flagged_for_review,
            })
            processed_files.append(file_result)

        except HTTPException as e:
            # Isolate the failure to this one file (e.g. a locked PDF) so the
            # rest of the batch still gets processed instead of aborting.
            file_result["status"] = "needs_password" if e.status_code == 422 else "failed"
            file_result["needs_password"] = e.status_code == 422
            file_result["error"] = str(e.detail)
            processed_files.append(file_result)
            print(
                "Statement parse failed: "
                f"user={user.id} file={original_filename} error={e.detail}"
            )
        except Exception as e:
            file_result["status"] = "failed"
            file_result["error"] = str(e)
            processed_files.append(file_result)
            print(
                "Statement parse failed unexpectedly: "
                f"user={user.id} file={original_filename} error={e}"
            )
        finally:
            _delete_saved_statement(saved_path)

    needs_password_files = [f["filename"] for f in processed_files if f.get("needs_password")]
    failed_files = [f["filename"] for f in processed_files if f["status"] == "failed"]

    message = f"Successfully parsed and appended {total_rows_written} transactions from {len(saved_files)} files."
    if needs_password_files:
        message += f" {len(needs_password_files)} file(s) need a password: {', '.join(needs_password_files)}."
    if failed_files:
        message += f" {len(failed_files)} file(s) failed: {', '.join(failed_files)}."

    try:
        return {
            "status": "success",
            "message": message,
            "transactions_count": len(all_extracted_txns),
            "rows_written": total_rows_written,
            "duplicates_skipped": total_duplicates_skipped,
            "flagged_for_review": total_flagged_for_review,
            "files": processed_files,
            "password_required": needs_password_files,
        }
    finally:
        db.close()


# --------------------------- Main orchestrator function -----------------
async def process_and_upload_statements(
    user: User,
    files: List[UploadFile],
    db: Session,
    password: str | None = None,
) -> dict:
    """
    Service to process uploaded bank statement files.
    Saves files, invokes the PDF LLM parser sequentially for each statement,
    saves extracted transactions into DB, then projects unsynced rows to Google Sheets.

    `password`, if given, comes from the frontend's password-entry popup
    (shown after a PDF fails to unlock) — the retry request re-sends that one
    file along with this password, used directly instead of guessed.
    """

    if not files:
        raise HTTPException(status_code=400, detail="No statement files uploaded.")

    if password and len(files) > 1:
        raise HTTPException(
            status_code=400,
            detail="A password can only be supplied when uploading a single statement.",
        )

    if not user.spreadsheet_id:
        raise HTTPException(status_code=400, detail="Google spreadsheet setup not completed.")

    saved_files = await _save_uploaded_statements(files, password=password)
    job_id = uuid4().hex
    filenames = [original_filename for original_filename, _saved_path, _password in saved_files]

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
