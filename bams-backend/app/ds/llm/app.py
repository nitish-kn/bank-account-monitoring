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
import sys
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF
from openai import OpenAI
from PIL import Image
from pydantic import ValidationError

from ...config import settings
from .schemas.models import ExtractionLogEntry, Transaction, TransactionBatch
# from tracing import init_tracing

OPENAI_API_KEY = settings.openai_api_key

# ------------------------------------------------------------------ #
# Configuration                                                       #
# ------------------------------------------------------------------ #

MODEL = "gpt-5.4-nano"          # Vision-capable; switch to "gpt-4o" for best accuracy
BATCH_SIZE = 5                  # Pages per API call
DPI = 150                       # Higher = better OCR but larger payloads (~150 is sweet spot)
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

* Convert to `YYYY-MM-DD` whenever possible.

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

Extract:

* UTR
* RRN
* Cheque Number
* Transaction ID
* Reference Number
* Similar identifiers

## vpa

* Extract any value matching `*@*`.

## counterparty

* Extract merchant, person, bank, or entity name from narration.

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

## balance_label

* `Cr` or `Dr` if explicitly printed.

## parser_metadata.page_number

* 1-based page number.

## pages_processed

* All page numbers included in the current batch.

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


def pdf_to_images(pdf_path: Path, dpi: int = DPI) -> list[bytes]:
    """
    Render every page of *pdf_path* to a JPEG byte-string.
    Returns a list ordered by page number (0-indexed internally,
    but page_number stored in metadata is 1-based).
    """
    doc = fitz.open(str(pdf_path))
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


# ------------------------------------------------------------------ #
# OpenAI Responses API call                                           #
# ------------------------------------------------------------------ #


def extract_batch(
    client: OpenAI,
    b64_images: list[str],
    page_numbers: list[int],
) -> TransactionBatch:
    """
    Send a batch of base-64 JPEG images to GPT-4o mini and return a
    validated TransactionBatch.  Uses Structured Outputs so the model
    is constrained to the TransactionBatch JSON schema.
    """
    # Build the content list: one image block per page.
    # Responses API uses "input_text" / "input_image" (not "text" / "image_url").
    content: list[dict] = []
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
            "Every visible transaction row must appear exactly once."
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
) -> list[Transaction]:
    if not pdf_path.exists():
        log.error("PDF not found: %s", pdf_path)
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Initialise Phoenix tracing before the OpenAI client is created
    # init_tracing()

    client = OpenAI(api_key=OPENAI_API_KEY)

    # 1 — Render all pages
    raw_images = pdf_to_images(pdf_path, dpi=dpi)
    total_pages = len(raw_images)
    log.info("Total pages: %d", total_pages)

    b64_images = images_to_base64(raw_images)

    # 2 — Process in batches
    all_transactions: list[Transaction] = []
    all_log_entries: list[ExtractionLogEntry] = []

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
            batch_result = extract_batch(client, batch_b64, page_numbers)
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

        valid, log_entry = validate_transactions(
            raw_transactions=batch_result.transactions,
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



def run(pdf_path: Path) -> list[dict]:
    transactions = extract_transactions_from_pdf(pdf_path)

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
