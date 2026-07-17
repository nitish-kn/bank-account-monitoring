import tempfile
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from .schemas.email_schema import EmailPayload
from .services.extractor import extract_transactions
from .app import run as extract_statement_transactions

app = FastAPI()


@app.get("/")
def health():
    return {
        "status": "running",
        "service": "transaction_extractor"
    }




@app.post("/process-emails")
async def process_emails(
    emails: List[EmailPayload]
):

    emails_data = []

    for email in emails:

        data = email.model_dump(
            by_alias=True
        )

        emails_data.append(
            data
        )

    return extract_transactions(
        emails_data
    )


@app.post("/process-statement")
async def process_statement(
    file: Optional[UploadFile] = File(None),
    file_path: Optional[str] = Form(None),
):
    """
    Test the bank-statement PDF extraction pipeline.
    Provide either a PDF file upload ("file") or a path to a PDF
    already on disk ("file_path") — not both.
    """

    if not file and not file_path:
        raise HTTPException(
            status_code=400,
            detail="Provide either a PDF file upload or a file_path.",
        )

    if file and file_path:
        raise HTTPException(
            status_code=400,
            detail="Provide only one of file or file_path, not both.",
        )

    if file_path:
        pdf_path = Path(file_path)

        if not pdf_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"File not found: {file_path}"
            )

        return extract_statement_transactions(pdf_path)

    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported."
        )

    contents = await file.read()

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(contents)
        tmp_path = Path(tmp.name)

    try:
        return extract_statement_transactions(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)
