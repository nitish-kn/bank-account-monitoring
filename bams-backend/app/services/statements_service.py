from fastapi import UploadFile, HTTPException
from googleapiclient.discovery import build
from pathlib import Path
import hashlib
import re
from uuid import uuid4
from typing import List

from ..models.user import User
from ..services.credentials import build_credentials
from ..utils.sheets_utils import _get_sheet_title, _read_existing_column_values
from ..utils.transaction_utils import (
    transactions_to_sheet_rows,
    transaction_column_for_field,
)
from .setup_service import append_sheet_with_emails

BACKEND_ROOT = Path(__file__).resolve().parents[2]
UPLOAD_DIR = BACKEND_ROOT / "uploads"


def _parse_statement_pdf(pdf_path: Path) -> list[dict]:
    try:
        from ..ds.llm.app import run
    except ModuleNotFoundError as error:
        missing_dependency = error.name or "PDF extraction dependency"
        raise HTTPException(
            status_code=500,
            detail=(
                f"Statement PDF extraction dependency missing: {missing_dependency}. "
                "Install backend PDF LLM dependencies from requirements.txt."
            ),
        ) from error

    return run(pdf_path)


def _safe_upload_name(filename: str | None, index: int) -> str:
    original_name = (filename or f"statement_{index}.pdf").replace("\\", "/").split("/")[-1]
    path = Path(original_name)
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "_", path.stem).strip("._") or f"statement_{index}"
    suffix = path.suffix.lower() or ".pdf"
    return f"{stem}_{uuid4().hex}{suffix}"


def _normalize_reference(value: str | None) -> str:
    return str(value or "").strip().lower()


def _fallback_reference(transaction: dict) -> str:
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
    normalized = dict(transaction or {})
    ref_number = str(normalized.get("ref_number") or "").strip() or _fallback_reference(normalized)
    parser_metadata = normalized.get("parser_metadata") or {}

    if hasattr(parser_metadata, "model_dump"):
        parser_metadata = parser_metadata.model_dump()

    parser_metadata = {
        **(parser_metadata if isinstance(parser_metadata, dict) else {}),
        "parsed_status": "parsed",
        "source": "statement_upload",
        "source_file": source_file,
    }

    normalized["ref_number"] = ref_number
    normalized.setdefault("id", ref_number)
    normalized.setdefault("gmail_message_id", "")
    normalized.setdefault("email_metadata", {})
    normalized["parser_metadata"] = parser_metadata
    normalized.setdefault("raw_data", {"source_file": source_file})
    normalized.setdefault("is_forwarded", False)

    return normalized


async def _save_uploaded_statements(files: List[UploadFile]) -> list[tuple[str, Path]]:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    saved_files: list[tuple[str, Path]] = []

    for index, file in enumerate(files, start=1):
        suffix = Path(file.filename or "").suffix.lower()
        if suffix != ".pdf":
            raise HTTPException(
                status_code=400,
                detail=f"Only PDF statements are supported: {file.filename or 'unnamed file'}",
            )

        content = await file.read()
        if not content:
            raise HTTPException(
                status_code=400,
                detail=f"Uploaded statement is empty: {file.filename or 'unnamed file'}",
            )

        saved_path = UPLOAD_DIR / _safe_upload_name(file.filename, index)
        saved_path.write_bytes(content)
        saved_files.append((file.filename or saved_path.name, saved_path))

    return saved_files


def _delete_saved_statement(saved_path: Path) -> None:
    try:
        if saved_path.exists():
            saved_path.unlink()
    except OSError as error:
        print(f"Failed to delete temporary statement file {saved_path}: {error}")

async def process_and_upload_statements(user: User, files: List[UploadFile]) -> dict:
    """
    Service to process uploaded bank statement files.
    Saves files, invokes the PDF LLM parser sequentially for each statement,
    and appends extracted transactions directly into the user's Google Sheet.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No statement files uploaded.")

    if not user.spreadsheet_id:
        raise HTTPException(status_code=400, detail="Google spreadsheet setup not completed.")

    saved_files = await _save_uploaded_statements(files)

    # 1. Connect to Google Sheets client using user's OAuth credentials
    try:
        credentials = build_credentials(user)
        sheets_service = build("sheets", "v4", credentials=credentials)
        sheet_title = _get_sheet_title(sheets_service, user.spreadsheet_id)

        # Retrieve all currently saved reference numbers to avoid duplicate insertions
        existing_ref_numbers = _read_existing_column_values(
            sheets_service,
            user.spreadsheet_id,
            sheet_title,
            transaction_column_for_field("ref_number"),
        )
        existing_ref_numbers = {
            _normalize_reference(ref)
            for ref in existing_ref_numbers
            if _normalize_reference(ref)
        }
    except Exception as e:
        for _, saved_path in saved_files:
            _delete_saved_statement(saved_path)
        raise HTTPException(status_code=500, detail=f"Failed to connect to Google Sheets or read reference numbers: {str(e)}")

    all_extracted_txns = []
    total_rows_written = 0
    processed_files = []
    skipped_duplicates = 0

    # 2. Iterate and process saved statement PDFs one-by-one
    for original_filename, saved_path in saved_files:
        try:
            # Parse statement PDF using app.ds.llm.app.run(Path)
            extracted_txns = _parse_statement_pdf(saved_path)
            if not extracted_txns:
                processed_files.append({
                    "filename": original_filename,
                    "stored_path": str(saved_path),
                    "transactions_found": 0,
                    "rows_written": 0,
                    "duplicates_skipped": 0,
                })
                continue

            # Filter out transactions that have a duplicate ref_number
            unique_txns = []
            for txn in extracted_txns:
                normalized_txn = _normalize_statement_transaction(txn, original_filename)
                ref = _normalize_reference(normalized_txn.get("ref_number"))

                if ref in existing_ref_numbers:
                    skipped_duplicates += 1
                    continue

                unique_txns.append(normalized_txn)
                existing_ref_numbers.add(ref)

            if not unique_txns:
                processed_files.append({
                    "filename": original_filename,
                    "stored_path": str(saved_path),
                    "transactions_found": len(extracted_txns),
                    "rows_written": 0,
                    "duplicates_skipped": len(extracted_txns),
                })
                continue

            all_extracted_txns.extend(unique_txns)
            
            # 3. Serialize extracted transactions to sheet rows
            rows = transactions_to_sheet_rows(unique_txns)
            if rows:
                # Safely append rows to the user's spreadsheet by reusing the existing setup utility
                sync_result = append_sheet_with_emails(user, user.spreadsheet_id, sheet_title, rows)
                rows_written = sync_result.get("rows_written", 0)
                total_rows_written += rows_written
            else:
                rows_written = 0

            processed_files.append({
                "filename": original_filename,
                "stored_path": str(saved_path),
                "transactions_found": len(extracted_txns),
                "rows_written": rows_written,
                "duplicates_skipped": len(extracted_txns) - len(unique_txns),
            })
                
        except HTTPException:
            # Re-raise HTTP exceptions to propagate cleaner API error codes
            raise
        except Exception as e:
            # Fallback error wrapper for unexpected process-interrupts
            raise HTTPException(
                status_code=500,
                detail=f"Failed processing statement '{original_filename}': {str(e)}"
            )
        finally:
            _delete_saved_statement(saved_path)

    return {
        "status": "success",
        "message": f"Successfully parsed and appended {total_rows_written} transactions from {len(saved_files)} files.",
        "transactions_count": len(all_extracted_txns),
        "rows_written": total_rows_written,
        "duplicates_skipped": skipped_duplicates,
        "files": processed_files,
    }
