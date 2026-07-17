from fastapi import UploadFile, HTTPException
from googleapiclient.discovery import build
from pathlib import Path
import hashlib
import re
from uuid import uuid4
from typing import List
from sqlalchemy.orm import Session

from ..core.constants import UPLOAD_DIR
from ..models.transactions import Transactions
from ..models.user import User
from ..services.credentials import build_credentials
from ..utils.db_utils import (
    build_transaction_dedupe_key,
    save_valid_transaction_to_db,
    update_parsed_status_to_db,
)
from ..utils.sheets_utils import _get_sheet_title
from .setup_service import _sync_transactions_to_sheet


# -------------------------- Main function which calls LLM ------------
def _parse_statement_pdf(pdf_path: Path) -> list[dict]:
    """ Main function to parse pdf calling the LLM """
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
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    saved_files: list[tuple[str, Path]] = []

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
        saved_path.write_bytes(content)
        saved_files.append((file.filename or saved_path.name, saved_path))

    return saved_files


def _delete_saved_statement(saved_path: Path) -> None:
    """ Delete the temporary files after processing """
    try:
        if saved_path.exists():
            saved_path.unlink()
    except OSError as error:
        print(f"Failed to delete temporary statement file {saved_path}: {error}")








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

    # 1. Save uploaded pdfs temporarily
    saved_files = await _save_uploaded_statements(files)

    try:
        # 2. Connect to Google Sheets client using user's OAuth credentials
        credentials = build_credentials(user)
        sheets_service = build("sheets", "v4", credentials=credentials)
        sheet_title = _get_sheet_title(sheets_service, user.spreadsheet_id)


        # 3. Load existing dedupe keys from DB into memory
        existing_dedupe_keys = {
            row.dedupe_key
            for row in db.query(Transactions.dedupe_key)
            .filter(
                Transactions.user_id == user.id,
                Transactions.dedupe_key.isnot(None),
            )
            .all()
            if row.dedupe_key
        }
    except Exception as e:
        for _, saved_path in saved_files:
            _delete_saved_statement(saved_path)
        raise HTTPException(status_code=500, detail=f"Failed to connect to Google Sheets or database: {str(e)}")

    all_extracted_txns = []             # Stores all unique transactions processed across all PDFs
    total_rows_written = 0              # Tracks how many rows were added to Google Sheets.
    processed_files = []                # Stores per-file summary information.
    skipped_duplicates = 0              # Counts duplicate transactions.

    # 4. Iterate and process saved statement PDFs one-by-one
    for original_filename, saved_path in saved_files:
        try:
            # 5. Parse statement PDF using app.ds.llm.app.run(Path)
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

            # 6. Filter out transactions that already exist in the DB dedupe set.
            unique_txns = []
            for txn in extracted_txns:

                normalized_txn = _normalize_statement_transaction(txn, original_filename)           # Make statement transactions look like your normal transaction objects
                dedupe_key = build_transaction_dedupe_key(normalized_txn, user.id)                  # This creates a unique identity for the transaction
                normalized_txn["dedupe_key"] = dedupe_key
                normalized_txn["gmail_message_id"] = f"stmt_{dedupe_key}"

                # 7. This checks the DB-loaded set, it is been ignore and increment the counter
                if dedupe_key in existing_dedupe_keys:
                    skipped_duplicates += 1
                    continue
                
                # 8. This adds the unique transactions and add the processed transactions dedupe key in the set for checking for rest of the rows
                unique_txns.append(normalized_txn)
                existing_dedupe_keys.add(dedupe_key)

            if not unique_txns:
                processed_files.append({
                    "filename": original_filename,
                    "stored_path": str(saved_path),
                    "transactions_found": len(extracted_txns),
                    "rows_written": 0,
                    "duplicates_skipped": len(extracted_txns),
                })
                continue
            
            # 9. Add unique transactions to overall list
            all_extracted_txns.extend(unique_txns)

            try:
                # 10. Add the valid transactions to the db 
                saved_transactions = save_valid_transaction_to_db(unique_txns, user.id, db)
                update_parsed_status_to_db(user.id, unique_txns, db)
                db.commit()
            except Exception as e:
                db.rollback()
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed saving statement transactions for '{original_filename}': {str(e)}"
                )

            # 11. Add those valid transaction to the sheets
            sync_result = _sync_transactions_to_sheet(
                user,
                db,
                sheets_service=sheets_service,
                sheet_title=sheet_title,
                transaction_ids=[transaction.id for transaction in saved_transactions],
            )
            rows_written = sync_result.get("rows_written", 0)
            total_rows_written += rows_written

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
