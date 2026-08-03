"""
main.py — Bank statement PDF → structured Transaction objects via GPT-4o mini Vision.

Pipeline
--------
1. Convert each PDF page to a JPEG image with PyMuPDF (fitz).
2. Group pages into batches of BATCH_SIZE (default 5).
3. Send each batch to the OpenAI Responses API using Structured Outputs
   so the model returns a validated TransactionBatch JSON envelope.
4. Run Transaction.model_validate() on every row; log invalids, keep valids.
5. Merge all batches → output/transactions.json + output/extraction_log.json.

Usage
-----
    Set OPENAI_API_KEY in bams-backend/.env
    python main.py [--pdf input/statement.pdf] [--batch-size 5] [--dpi 150]

Requirements
------------
    pip install openai pydantic pymupdf pillow
"""

from __future__ import annotations

import argparse
import base64
import json
import logging
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any, Optional

import fitz  # PyMuPDF
from openai import OpenAI
from PIL import Image
from pydantic import BaseModel, Field, ValidationError

from ...config import settings
from .schemas.transaction_schema import Transaction
from .utils.account_lookup import fill_missing_account_details, get_pdf_password_from_filename
from .utils.credit_card_lookup import fill_missing_credit_card_details
# from tracing import init_tracing

OPENAI_API_KEY = settings.openai_api_key


# ------------------------------------------------------------------ #
# Batch orchestration envelopes                                       #
# ------------------------------------------------------------------ #
# These wrap the per-page-batch LLM call/logging and are never persisted;
# the stored Transaction schema is unified with app/models/transactions.py.


class AccountContext(BaseModel):
    bank_name: Optional[str] = None
    account_holder_name: Optional[str] = None
    account_number: Optional[str] = None
    account_type: Optional[str] = None
    currency: Optional[str] = None


class TransactionBatch(BaseModel):
    transactions: list[Transaction] = Field(default_factory=list)
    pages_processed: list[int] = Field(default_factory=list)
    account_context: AccountContext = Field(default_factory=AccountContext)
    extraction_notes: Optional[str] = None


class ExtractionLogEntry(BaseModel):
    batch_index: int
    pages: list[int]
    raw_count: int
    valid_count: int
    invalid_count: int
    invalid_records: list[dict] = Field(default_factory=list)
    error: Optional[str] = None
    extraction_notes: Optional[str] = None

# ------------------------------------------------------------------ #
# Configuration                                                       #
# ------------------------------------------------------------------ #

MODEL = "gpt-5.4-mini"          # Vision-capable; switch to "gpt-4o" for best accuracy
BATCH_SIZE = 1                # Pages per API call
DPI = 200                       # Higher = better OCR but larger payloads (~150 is sweet spot)
JPEG_QUALITY = 90               # JPEG compression quality
MAX_LONG_EDGE_PX = 2048         # Resize if either dimension exceeds this
OUTPUT_DIR = Path("output")
INPUT_PDF = Path("input/statement.pdf")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ------------------------------------------------------------------ #
# System prompt                                                       #
# ------------------------------------------------------------------ #

SYSTEM_PROMPT = """
You are an expert bank-statement transaction extraction engine.

# GOAL

Extract ONLY actual financial transactions from the statement and return one Transaction object per transaction.

---

# CRITICAL FILTER

Before extracting any row, classify it as one of:

* TRANSACTION
* BALANCE_ROW
* TOTAL_ROW
* SUMMARY_ROW
* HEADER_ROW
* FOOTER_ROW
* CARRIED_FORWARD
* INFORMATION_ROW

Only extract rows classified as **TRANSACTION**.

### Never Extract

* Opening Balance
* Closing Balance
* Available Balance
* Ledger Balance
* Balance B/F
* Balance C/F
* Total Debit
* Total Credit
* Net Total
* Monthly Summary
* Statement Summary
* Page Total
* Grand Total
* Interest Summary
* Carried Forward Rows
* Headers
* Footers
* Notes
* Messages
* Account Information Rows

A row is a **TRANSACTION** only if it represents a distinct movement of money (credit or debit).

---

# NUMBER VALIDATION RULES

Do not assume every number on the page is a transaction amount.

Numbers may represent:

* Cheque Numbers
* Chq No
* Branch Codes
* Running Balances
* Page Numbers

A row is a transaction only when there is evidence of:

1. A transaction date
2. A debit amount or credit amount
3. A transaction narration/description

A standalone number is **NOT** a transaction amount.

If a row contains only a cheque number, reference number, account number, balance value, or identifier without an actual debit/credit movement, ignore the row completely.

### When Multiple Numbers Appear in a Row

1. Prefer values under Debit/Credit columns.
2. Treat values under Balance columns as balances.
3. Treat values under Chq No columns as cheque numbers.
4. Treat long alphanumeric strings in narration as reference numbers.
5. Never classify a cheque number or reference number as a transaction amount.

---

# EXTRACTION RULES

1. One Transaction object per transaction row.
2. Never merge rows.
3. Never invent values.
4. Extract every transaction visible on the page.
5. Repeat account-level fields (`bank_name`, `account_holder_name`, `account_number`, `account_type`, `currency`) on every transaction.

---

# STATEMENT ACCOUNT CONTEXT

Account details are statement-level header details, not transaction rows.

On the first page/header of a bank statement, carefully extract:

* `bank_name`
* `account_holder_name`
* `account_number`
* `account_type`
* `currency`

Return these values in `account_context`, and repeat the same values on every extracted transaction.

## Account number accuracy

The account number is usually clearly labelled on the first page/header, near labels such as:

* Account Number
* Account No
* A/c No
* Account ID
* Customer Account Number

Use the value next to the account-number label.

Never use any of these as `account_number`:

* Mobile number
* Phone number
* Customer ID
* CIF ID
* PAN
* Aadhaar
* IFSC
* MICR
* Branch code
* Statement number
* Reference number

If the statement shows both a clear account number and a masked account number, use the clear account number from the first page/header.
If a later page does not repeat account details, reuse the supplied known statement account context.

## Account holder accuracy

Extract the actual customer/account holder name from the first page/header, usually near labels such as:

* Account Holder
* Customer Name
* Name
* Account Name

Do not use branch name, bank name, nominee name, phone number, email, address text, or transaction counterparty as `account_holder_name`.

---

# DEBIT/CREDIT DETERMINATION

### Priority 1

Use explicit Debit and Credit columns if present.

### Priority 2

Use narration keywords:

* SELF TRANSFER sent → debit
* TPARTY TRANSFER sent → debit
* RTGS received → credit
* NEFT received → credit
* TAX REFUND → credit
* INTEREST PAID → credit
* CHARGES / FEE / GST → debit

### Priority 3

If only Amount and Balance are visible:

* Compare with previous transaction balance.
* If balance increased by amount → credit.
* If balance decreased by amount → debit.

### Priority 4

If direction still cannot be determined:

* Set `txn_type = null`
* Do not guess.

---

# FIELD RULES

## txn_date

* If the statement prints a time alongside the date for this row (e.g. UPI/IMPS narrations often show one), return `YYYY-MM-DD HH:MM:SS` (24-hour clock) with that exact time.
* If no time is printed for this row, return `YYYY-MM-DD` only. Never invent a time that isn't shown.

## bank_name

* The issuing bank as printed on the statement letterhead/header. Repeat it on every transaction from that statement.

## account_holder_name

* Extract the statement customer's name from the first page/header.
* Prefer values beside labels like `Account Holder`, `Customer Name`, `Account Name`, or `Name`.
* Do not use a mobile number, email address, branch name, bank name, nominee, address line, or transaction counterparty as the account holder.

## account_number

* Extract the account number from the labelled account-number field on the first page/header.
* Prefer labels like `Account Number`, `Account No`, `A/c No`, `Account ID`, or `Customer Account Number`.
* If a clear account number and a masked account number both appear, use the clear account number.
* Never use phone/mobile numbers, customer IDs, CIF IDs, PAN, Aadhaar, IFSC, MICR, branch codes, statement numbers, reference numbers, or transaction IDs as the account number.

* Extract exactly as printed, including masked forms (e.g. `XX6744`). Usually printed once in the statement header — repeat it on every transaction.
* If this is a credit card statement (txn_via = `Credit Card`), leave this null — put the card number in optional_fields.credit_card_number instead.

## account_type

* E.g. `Savings`, `Current`, `Credit Card`, only if stated in the header. Otherwise null.

## amount

* Numeric string only.
* Remove commas and currency symbols.

## txn_type

* `debit` = money out
* `credit` = money in
* Infer from Dr/Cr columns, narration, or balance movement.
* Never leave null when evidence exists.

## mode

Detect from narration:

| Keyword             | Mode        |
| ------------------- | ----------- |
| UPI                 | UPI         |
| NEFT                | NEFT        |
| RTGS                | RTGS        |
| IMPS                | IMPS        |
| ATM / CASH WDL      | ATM         |
| POS / PURCHASE      | POS         |
| CHQ / CHEQUE        | Cheque      |
| ECS / NACH / SI     | ECS/NACH    |
| ENACH / E-MANDATE   | eNACH       |
| INB / NETBANKING    | Net Banking |
| INTEREST            | Interest    |
| CHARGES / FEE / GST | Bank Charge |

## currency

* Default to `INR` for Indian bank statements.

## ref_number

* Extract the UTR / RRN / cheque number / transaction ID / reference number when it appears in a dedicated column.
* If there is no dedicated column, look inside the narration for a 12–18 character numeric or alphanumeric code — it is not always present, so return null if you can't find one. Do not confuse it with a phone number, account number, or amount.
* Common pattern: in narrations like `UPI/P2M/655559022350/CRED Club`, the digits between the slashes are the reference number.

## txn_via

Always exactly one of: `Bank Transaction` | `Credit Card` | `FASTag`

* `Credit Card` — the row belongs to a credit card account or credit card spend/payment/refund.
  Put the card number (masked or full) in optional_fields.credit_card_number, NOT in account_number.
* `FASTag` — toll deduction, FASTag recharge or payment.
* Everything else (UPI, NEFT, RTGS, IMPS, cash, cheque, ECS/NACH, salary, interest, etc.) → `Bank Transaction`.

## counterparty

* Extract ONLY the merchant/person/bank/entity name from the narration.
* Never include account numbers, masked numbers, reference/UTR numbers, IFSC codes, branch names, IDs, phone numbers, or anything in ()/[]/{}.
* ATM withdrawal / cash withdrawal rows (category = `Cash Withdrawal`) — counterparty MUST be `Self`. The account holder is withdrawing their own cash, so it is not a real third-party counterparty.

## counterparty_kind

Possible values:

* merchant
* individual
* bank
* government
* employer

## category

Examples:

* Salary
* Food & Dining
* Shopping
* Travel
* Entertainment
* Utilities
* Healthcare
* Education
* Cash Withdrawal
* Interest
* Bank Charges
* Other

## balance_after_txn

* Extract running balance if available.

## system-assigned fields

Leave these fields null — they are filled in by our code, not by you:

* id
* gmail_message_id
* source
* dedupe_key
* email_metadata (all sub-fields)
* parser_metadata (all sub-fields)
* optional_fields.trips_left, optional_fields.vehicle_number (FASTag details only ever come from email, not statements)
* optional_fields.credit_card_owner, optional_fields.credit_card_issuer, optional_fields.card_name, optional_fields.card_type (resolved from our records using optional_fields.credit_card_number)

## pages_processed

* All page numbers included in the current batch.

## account_context

* Return the statement-level account details visible in this batch or supplied as known context.
* If the batch includes page 1, extract account details from page 1/header.
* If the batch does not include page 1 but known statement account context is supplied, return that supplied context.
* Use the same account context values on every transaction in the batch unless the statement clearly changes account.

---

# FINAL VALIDATION

Before returning:

1. Count transaction rows on the page.
2. Count extracted Transaction objects.
3. They must match.
4. Exclude all balance, summary, total, carried-forward, header, footer, and informational rows.
5. Return only actual money-movement transactions.
"""
# ------------------------------------------------------------------ #
# PDF → image helpers                                                 #
# ------------------------------------------------------------------ #


def pdf_to_images(pdf_path: Path, dpi: int = DPI, password: Optional[str] = None) -> list[bytes]:
    """
    Render every page of *pdf_path* to a JPEG byte-string.
    Returns a list ordered by page number (0-indexed internally,
    but page_number stored in metadata is 1-based).
    """
    doc = fitz.open(str(pdf_path))

    if doc.needs_pass:
        if not password or not doc.authenticate(password):
            doc.close()
            raise ValueError(
                f"PDF '{pdf_path.name}' is password protected and the correct "
                "password could not be resolved from the bank accounts mapping."
            )
        log.info("Unlocked password-protected PDF: %s", pdf_path.name)

    images: list[bytes] = []
    zoom = dpi / 72  # 72 is the PDF baseline DPI
    mat = fitz.Matrix(zoom, zoom)

    log.info("Rendering %d pages at %d DPI …", len(doc), dpi)
    for page_index in range(len(doc)):
        page = doc[page_index]
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)

        # Resize if too large (keeps API latency & cost reasonable)
        max_dim = max(img.width, img.height)
        if max_dim > MAX_LONG_EDGE_PX:
            scale = MAX_LONG_EDGE_PX / max_dim
            img = img.resize(
                (int(img.width * scale), int(img.height * scale)),
                Image.LANCZOS,
            )

        buf = BytesIO()
        img.save(buf, format="JPEG", quality=JPEG_QUALITY)
        images.append(buf.getvalue())
        log.debug("  Page %d: %dx%d px, %d KB", page_index + 1, img.width, img.height, len(buf.getvalue()) // 1024)

    doc.close()
    return images


def images_to_base64(images: list[bytes]) -> list[str]:
    return [base64.b64encode(img).decode("utf-8") for img in images]


def _resolve_pdf_password(pdf_path: Path, original_filename: Optional[str]) -> Optional[str]:
    """
    Uploaded statements are frequently saved to disk under a sanitized/
    UUID'd name, so the account's last-4 digits (embedded in the
    *original* filename) may no longer be present in pdf_path.name.
    Prefer the caller-supplied original filename and fall back to the
    on-disk name only when no original was passed through.
    """
    filename_for_lookup = original_filename or pdf_path.name
    password = get_pdf_password_from_filename(filename_for_lookup)
    if password:
        log.info("Resolved statement password from bank accounts mapping for: %s", filename_for_lookup)
    return password


# ------------------------------------------------------------------ #
# Statement account context helpers                                  #
# ------------------------------------------------------------------ #

ACCOUNT_CONTEXT_FIELDS = (
    "bank_name",
    "account_holder_name",
    "account_number",
    "account_type",
    "currency",
)

EMPTY_ACCOUNT_VALUES = {"", "-", "--", "n/a", "na", "none", "null", "not available"}


def _clean_account_value(value: Any) -> Optional[str]:
    text = str(value or "").strip()
    return None if text.lower() in EMPTY_ACCOUNT_VALUES else text


def _account_context_dict(context: AccountContext | dict | None) -> dict[str, str]:
    if context is None:
        return {}

    if isinstance(context, AccountContext):
        raw_context = context.model_dump()
    elif isinstance(context, dict):
        raw_context = context
    else:
        return {}

    cleaned: dict[str, str] = {}
    for field in ACCOUNT_CONTEXT_FIELDS:
        value = _clean_account_value(raw_context.get(field))
        if value:
            cleaned[field] = value

    return cleaned


def _transaction_account_context(transaction: dict) -> dict[str, str]:
    if str(transaction.get("txn_via") or "").strip().lower() == "credit card":
        return {}

    return {
        field: value
        for field in ACCOUNT_CONTEXT_FIELDS
        if (value := _clean_account_value(transaction.get(field)))
    }


def _merge_account_context(
    current_context: dict[str, str],
    incoming_context: AccountContext | dict | None,
) -> None:
    for field, value in _account_context_dict(incoming_context).items():
        current_context.setdefault(field, value)


def _apply_account_context(
    transaction: dict,
    account_context: dict[str, str],
    overwrite: bool = False,
) -> dict:
    if str(transaction.get("txn_via") or "").strip().lower() == "credit card":
        return transaction

    for field, value in account_context.items():
        if overwrite or not _clean_account_value(transaction.get(field)):
            transaction[field] = value

    return transaction


def _format_account_context_for_prompt(account_context: dict[str, str]) -> Optional[str]:
    cleaned_context = {
        field: value
        for field, value in account_context.items()
        if field in ACCOUNT_CONTEXT_FIELDS and _clean_account_value(value)
    }
    if not cleaned_context:
        return None

    context_lines = "\n".join(
        f"- {field}: {value}"
        for field, value in cleaned_context.items()
    )
    return (
        "Known statement account context from earlier pages. "
        "Use these values for every transaction in this batch unless this batch "
        "clearly belongs to a different account:\n"
        f"{context_lines}"
    )


# ------------------------------------------------------------------ #
# OpenAI Responses API call                                           #
# ------------------------------------------------------------------ #


def extract_batch(
    client: OpenAI,
    b64_images: list[str],
    page_numbers: list[int],
    account_context: dict[str, str] | None = None,
) -> TransactionBatch:
    """
    Send a batch of base-64 JPEG images to GPT-4o mini and return a
    validated TransactionBatch.  Uses Structured Outputs so the model
    is constrained to the TransactionBatch JSON schema.
    """
    # Build the content list: one image block per page.
    # Responses API uses "input_text" / "input_image" (not "text" / "image_url").
    content: list[dict] = []
    account_context_prompt = _format_account_context_for_prompt(account_context or {})
    if account_context_prompt:
        content.append({
            "type": "input_text",
            "text": account_context_prompt,
        })

    for b64, pnum in zip(b64_images, page_numbers):
        content.append({
            "type": "input_text",
            "text": f"--- Page {pnum} ---",
        })
        content.append({
            "type": "input_image",
            "image_url": f"data:image/jpeg;base64,{b64}",
        })

    content.append({
        "type": "input_text",
        "text": (
            "Extract all transaction rows from the pages above. "
            "Return a TransactionBatch JSON object. "
            "Every visible transaction row must appear exactly once. "
            "Fill account_context and repeat account-level details on every transaction."
        ),
    })

    response = client.responses.parse(
        model=MODEL,
        instructions=SYSTEM_PROMPT,
        input=[{"role": "user", "content": content}],
        text_format=TransactionBatch,
    )

    batch: TransactionBatch = response.output_parsed
    return batch


# ------------------------------------------------------------------ #
# Per-record validation                                               #
# ------------------------------------------------------------------ #


def validate_transactions(
    raw_transactions: list[Transaction],
    batch_index: int,
    pages: list[int],
    extraction_notes: Optional[str],
) -> tuple[list[Transaction], ExtractionLogEntry]:
    """
    Run model_validate() on every Transaction; separate valid from invalid.
    Returns (valid_list, log_entry).
    """
    valid: list[Transaction] = []
    invalid_records: list[dict] = []

    for tx in raw_transactions:
        try:
            validated = Transaction.model_validate(tx.model_dump())
            valid.append(validated)
        except ValidationError as exc:
            log.warning("Invalid record in batch %d: %s", batch_index, exc)
            invalid_records.append({
                "raw": tx.model_dump(),
                "errors": exc.errors(),
            })

    entry = ExtractionLogEntry(
        batch_index=batch_index,
        pages=pages,
        raw_count=len(raw_transactions),
        valid_count=len(valid),
        invalid_count=len(invalid_records),
        invalid_records=invalid_records,
        extraction_notes=extraction_notes,
    )

    log.info(
        "Batch %d (pages %s): %d raw → %d valid, %d invalid",
        batch_index,
        pages,
        len(raw_transactions),
        len(valid),
        len(invalid_records),
    )
    return valid, entry


# ------------------------------------------------------------------ #
# Main orchestration                                                  #
# ------------------------------------------------------------------ #


def extract_transactions_from_pdf(
    pdf_path: Path,
    batch_size: int = BATCH_SIZE,
    dpi: int = DPI,
    original_filename: Optional[str] = None,
) -> list[Transaction]:
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Initialise Phoenix tracing before the OpenAI client is created
    # init_tracing()

    client = OpenAI(api_key=OPENAI_API_KEY)

    password = _resolve_pdf_password(pdf_path, original_filename)

    # 1 — Render all pages
    raw_images = pdf_to_images(pdf_path, dpi=dpi, password=password)
    total_pages = len(raw_images)
    log.info("Total pages: %d", total_pages)

    b64_images = images_to_base64(raw_images)

    # 2 — Process in batches
    all_transactions: list[Transaction] = []
    all_log_entries: list[ExtractionLogEntry] = []
    statement_account_context: dict[str, str] = {}

    batches = [
        list(range(i, min(i + batch_size, total_pages)))
        for i in range(0, total_pages, batch_size)
    ]
    log.info("Processing %d batches of up to %d pages each …", len(batches), batch_size)

    for batch_idx, page_indices in enumerate(batches):
        page_numbers = [p + 1 for p in page_indices]  # 1-based
        log.info("Batch %d / %d — pages %s", batch_idx + 1, len(batches), page_numbers)

        batch_b64 = [b64_images[i] for i in page_indices]

        try:
            batch_result = extract_batch(
                client,
                batch_b64,
                page_numbers,
                account_context=statement_account_context,
            )
        except Exception as exc:
            log.error("Batch %d failed: %s", batch_idx + 1, exc)
            all_log_entries.append(
                ExtractionLogEntry(
                    batch_index=batch_idx + 1,
                    pages=page_numbers,
                    raw_count=0,
                    valid_count=0,
                    invalid_count=0,
                    error=str(exc),
                )
            )
            continue

        _merge_account_context(statement_account_context, batch_result.account_context)

        enriched_transactions = []
        for tx in batch_result.transactions:
            tx_dict = tx.model_dump()
            _merge_account_context(statement_account_context, _transaction_account_context(tx_dict))
            tx_dict = _apply_account_context(tx_dict, statement_account_context)
            # print(f"BEFORE ENRICHMENT - {tx_dict}")
            enriched_tx = fill_missing_account_details(tx_dict)
            # print(f"ENRICHED - {enriched_tx}")
            enriched_tx = fill_missing_credit_card_details(enriched_tx)
            # enriched_tx = _apply_account_context(
            #     enriched_tx,
            #     statement_account_context,
            #     overwrite=True,
            # )
            # print(f"FINAL ENRICHED - {enriched_tx}")

            # Cash withdrawal has no real counterparty — it's the account
            # holder withdrawing their own money, so "same acc to same acc"
            # would otherwise look like a conflicting transfer.
            if str(enriched_tx.get("category") or "").strip().lower() == "cash withdrawal":
                enriched_tx["counterparty"] = "Self"

            enriched_tx["source"] = "statement"

            parser_metadata = enriched_tx.get("parser_metadata") or {}
            parser_metadata["parsed_status"] = "parsed"
            parser_metadata["source_file"] = pdf_path.name
            enriched_tx["parser_metadata"] = parser_metadata

            # dedupe_key is intentionally left blank for now

            enriched_transactions.append(Transaction.model_validate(enriched_tx))

        valid, log_entry = validate_transactions(
            raw_transactions=enriched_transactions,
            batch_index=batch_idx + 1,
            pages=page_numbers,
            extraction_notes=batch_result.extraction_notes,
        )

        all_transactions.extend(valid)
        all_log_entries.append(log_entry)

    failed_batches = [entry for entry in all_log_entries if entry.error]
    if batches and len(failed_batches) == len(batches):
        first_error = failed_batches[0].error or "Unknown extraction error"
        raise RuntimeError(f"PDF extraction failed for all batches: {first_error}")

    # # 3 — Save results
    # transactions_path = OUTPUT_DIR / "ICICI_transactions.json"
    # log_path = OUTPUT_DIR / "ICICI_extraction_log.json"

    # transactions_payload = [tx.model_dump(mode="json") for tx in all_transactions]
    # with open(transactions_path, "w", encoding="utf-8") as fh:
    #     json.dump(transactions_payload, fh, indent=2, default=str)

    # log_payload = {
    #     "extracted_at": datetime.now(timezone.utc).isoformat(),
    #     "source_pdf": str(pdf_path),
    #     "total_pages": total_pages,
    #     "total_transactions": len(all_transactions),
    #     "batches": [e.model_dump(mode="json") for e in all_log_entries],
    # }
    # with open(log_path, "w", encoding="utf-8") as fh:
    #     json.dump(log_payload, fh, indent=2, default=str)

    log.info("=" * 60)
    log.info("Extraction complete.")
    log.info("  Transactions : %d", len(all_transactions))
    # log.info("  Output       : %s", transactions_path)
    # log.info("  Log          : %s", log_path)
    log.info("=" * 60)

    return all_transactions



def run(pdf_path: Path, original_filename: Optional[str] = None) -> list[dict]:
    transactions = extract_transactions_from_pdf(pdf_path, original_filename=original_filename)

    return [
        tx.model_dump(mode="json")
        for tx in transactions
    ]


# ------------------------------------------------------------------ #
# CLI                                                                 #
# ------------------------------------------------------------------ #


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract transactions from a bank-statement PDF using GPT-4o mini Vision."
    )
    parser.add_argument(
        "--pdf",
        type=Path,
        default=INPUT_PDF,
        help=f"Path to the bank statement PDF (default: {INPUT_PDF})",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=BATCH_SIZE,
        help=f"Number of pages per API call (default: {BATCH_SIZE})",
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=DPI,
        help=f"Rendering resolution (default: {DPI})",
    )
    return parser.parse_args()


if __name__ == "__main__":
    print(run(Path(r"C:\Users\utkar\Downloads\icici_statement.pdf")))
