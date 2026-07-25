import tempfile
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from ...database import SessionLocal
from ...services.ledger_service import persist_transactions_batch, reconcile_statement_batch
from .schemas.email_schema import EmailPayload
from .services.extractor import extract_transactions
from .app import run as extract_statement_transactions

app = FastAPI()


def _direct_upload_file(file):
    """Ignore FastAPI's File(None) marker when this endpoint function is called directly."""

    if hasattr(file, "filename") and hasattr(file, "read"):
        return file
    return None


def _direct_form_text(value) -> str | None:
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _direct_form_int(value) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def _write_temp_pdf(contents: bytes) -> Path:
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(contents)
        return Path(tmp.name)


def _reconcile_statement_transactions(transactions: list[dict], user_id: int) -> None:
    db = SessionLocal()
    try:
        reconcile_statement_batch(db, transactions, user_id)
    finally:
        db.close()


@app.get("/")
def health():
    return {
        "status": "running",
        "service": "transaction_extractor"
    }




@app.post("/process-emails")
async def process_emails(
    emails: List[EmailPayload],
    user_id: Optional[int] = None,
):

    emails_data = []

    for email in emails:
        email_payload = (
            email
            if isinstance(email, EmailPayload)
            else EmailPayload.model_validate(email)
        )
        data = email_payload.model_dump(
            by_alias=True
        )

        emails_data.append(
            data
        )

    transactions = extract_transactions(
        emails_data
    )
    parsed_count = sum(
        1
        for transaction in transactions or []
        if str(
            (transaction.get("parser_metadata") or {}).get("parsed_status") or ""
        ).strip().lower() == "parsed"
    )
    print(
        "Email parse result: "
        f"emails={len(emails_data)} rows={len(transactions or [])} parsed={parsed_count}"
    )

    # Updates bank_accounts running balances only. Never writes to the
    # transactions table — persist_transactions_batch mutates each dict in
    # `transactions` in place with its computed balance_after_txn.
    if user_id is not None:
        db = SessionLocal()
        try:
            persist_transactions_batch(db, transactions, user_id)
        finally:
            db.close()

    return transactions


@app.post("/process-statement")
async def process_statement(
    file: Optional[UploadFile] = File(None),
    file_path: Optional[str] = Form(None),
    user_id: Optional[int] = Form(None),
):
    """
    Test the bank-statement PDF extraction pipeline.
    Provide either a PDF file upload ("file") or a path to a PDF
    already on disk ("file_path") — not both.

    Statement transactions are matched (read-only) against whatever's
    already in the DB (from e.g. an email flow) purely to enrich the
    returned transaction dicts — see reconcile_statement_batch. Only
    bank_accounts is ever written to; the transactions table is never
    inserted into or updated.
    """

    upload_file = _direct_upload_file(file)
    resolved_file_path = _direct_form_text(file_path)
    resolved_user_id = _direct_form_int(user_id)

    if upload_file is None and resolved_file_path is None:
        raise HTTPException(
            status_code=400,
            detail="Provide either a PDF file upload or a file_path.",
        )

    if upload_file is not None and resolved_file_path is not None:
        raise HTTPException(
            status_code=400,
            detail="Provide only one of file or file_path, not both.",
        )

    if resolved_file_path:
        pdf_path = Path(resolved_file_path)

        if not pdf_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"File not found: {resolved_file_path}"
            )

        transactions = await run_in_threadpool(extract_statement_transactions, pdf_path)
        print(
            "Statement parse result: "
            f"source=file_path rows={len(transactions or [])}"
        )

        if resolved_user_id is not None:
            await run_in_threadpool(
                _reconcile_statement_transactions,
                transactions,
                resolved_user_id,
            )

        return transactions

    if not (upload_file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported."
        )

    contents = await upload_file.read()

    tmp_path = await run_in_threadpool(_write_temp_pdf, contents)

    try:
        transactions = await run_in_threadpool(extract_statement_transactions, tmp_path)
        print(
            "Statement parse result: "
            f"source=upload rows={len(transactions or [])}"
        )

        # if resolved_user_id is not None:
        #     await run_in_threadpool(
        #         _reconcile_statement_transactions,
        #         transactions,
        #         resolved_user_id,
        #     )

        return transactions

    finally:
        tmp_path.unlink(missing_ok=True)
