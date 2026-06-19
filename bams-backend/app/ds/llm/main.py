from fastapi import FastAPI
from typing import List

from schemas.email_schema import EmailPayload
from services.extractor import extract_transactions

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