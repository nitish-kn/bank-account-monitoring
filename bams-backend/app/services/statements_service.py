from fastapi import UploadFile, HTTPException
from googleapiclient.discovery import build
from typing import List

from ..models.user import User
from ..services.credentials import build_credentials
from ..utils.sheets_utils import _get_sheet_title, _read_existing_column_values
from ..utils.transaction_utils import transactions_to_sheet_rows, TRANSACTION_SCHEMA, _column_name
from .setup_service import append_sheet_with_emails

# Make the LLM parsing function replaceable quickly by importing it here
from ..ds.llm.services.extractor import extract_transactions as parse_statement_with_llm

async def process_and_upload_statements(user: User, files: List[UploadFile]) -> dict:
    """
    Service to process uploaded bank statement files.
    Reads file content, invokes the LLM parser sequentially for each statement,
    and appends extracted transactions directly into the user's Google Sheet.
    """
    if not user.spreadsheet_id:
        raise HTTPException(status_code=400, detail="Google spreadsheet setup not completed.")

    # 1. Connect to Google Sheets client using user's OAuth credentials
    try:
        credentials = build_credentials(user)
        sheets_service = build("sheets", "v4", credentials=credentials)
        sheet_title = _get_sheet_title(sheets_service, user.spreadsheet_id)

        # Determine the column letter for ref_number in Google Sheets
        ref_col_index = TRANSACTION_SCHEMA.index("ref_number") + 1
        ref_col_letter = _column_name(ref_col_index)

        # Retrieve all currently saved reference numbers to avoid duplicate insertions
        existing_ref_numbers = _read_existing_column_values(
            sheets_service, user.spreadsheet_id, sheet_title, ref_col_letter
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to connect to Google Sheets or read reference numbers: {str(e)}")

    all_extracted_txns = []
    total_rows_written = 0

    # 2. Iterate and process statement files one-by-one
    for idx, file in enumerate(files):
        try:
            # Read statement binary/text content
            content = await file.read()
            # Decode file contents to string, ignoring invalid characters (for simple text/PDF extraction)
            body_text = content.decode("utf-8", errors="ignore")
            
            # Format payload structure matching what is expected by the LLM extractor
            payload = [{
                "id": f"upload_{file.filename}_{idx}",
                "from": "Statement Upload",
                "subject": file.filename,
                "body": body_text
            }]
            
            # Parse statement using the LLM model
            extracted_txns = parse_statement_with_llm(payload)
            if not extracted_txns:
                continue

            # Filter out transactions that have a duplicate ref_number
            unique_txns = []
            for txn in extracted_txns:
                ref = str(txn.get("ref_number") or "").strip()
                if ref and ref in existing_ref_numbers:
                    # Skip duplicate transaction
                    continue
                unique_txns.append(txn)
                if ref:
                    existing_ref_numbers.add(ref) # Track inside this batch session

            if not unique_txns:
                continue

            all_extracted_txns.extend(unique_txns)
            
            # 3. Serialize extracted transactions to sheet rows
            rows = transactions_to_sheet_rows(unique_txns)
            if rows:
                # Safely append rows to the user's spreadsheet by reusing the existing setup utility
                sync_result = append_sheet_with_emails(user, user.spreadsheet_id, sheet_title, rows)
                total_rows_written += sync_result.get("rows_written", 0)
                
        except HTTPException:
            # Re-raise HTTP exceptions to propagate cleaner API error codes
            raise
        except Exception as e:
            # Fallback error wrapper for unexpected process-interrupts
            raise HTTPException(
                status_code=500,
                detail=f"Failed processing statement '{file.filename}': {str(e)}"
            )

    return {
        "status": "success",
        "message": f"Successfully parsed and appended {total_rows_written} transactions from {len(files)} files.",
        "transactions_count": len(all_extracted_txns),
        "rows_written": total_rows_written
    }
