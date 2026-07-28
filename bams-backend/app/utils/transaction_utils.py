import json
from datetime import datetime, time
from email.utils import parsedate_to_datetime
from typing import Any, Mapping, Optional

from ..core.constants import (
    GMAIL_MESSAGE_ID_COLUMN,
    GMAIL_MESSAGE_ID_FIELD,
    JSON_TRANSACTION_FIELDS,
    TRANSACTION_DATA_RANGE,
    TRANSACTION_HEADER_RANGE,
    TRANSACTION_SCHEMA,
    TRANSACTION_SHEET_END_COLUMN,
    VALID_TRANSACTION_TYPES,
)

DATE_ONLY_FORMATS = [
    "%Y-%m-%d",
    "%Y/%m/%d",

    "%d/%m/%Y",
    "%d-%m-%Y",
    "%d.%m.%Y",

    "%d/%m/%y",
    "%d-%m-%y",

    "%m/%d/%Y",
    "%m-%d-%Y",

    "%d %b %Y",
    "%d %B %Y",

    "%b %d %Y",
    "%B %d %Y",

    "%d %b %y",
    "%d %B %y",

    "%b %d %y",
    "%B %d %y",
]

# Same set of date formats, each paired with a trailing time-of-day so a
# combined "date time" string (whichever separator the source uses) can
# still be parsed without losing the time component.
DATE_TIME_FORMATS = [
    f"{date_fmt}{sep}{time_fmt}"
    for date_fmt in DATE_ONLY_FORMATS
    for sep in (" ", "T")
    for time_fmt in ("%H:%M:%S", "%H:%M", "%I:%M:%S %p", "%I:%M %p")
]


def _parse_transaction_datetime(raw_date: Any) -> Optional[datetime]:
    """Best-effort parse of any transaction date/datetime-ish value, keeping
    the time-of-day when the source actually provides one."""

    if raw_date is None:
        return None

    if isinstance(raw_date, datetime):
        return raw_date

    text = str(raw_date).strip()
    if not text:
        return None

    text = text.replace(",", "").replace("Z", "+00:00")

    # ISO formats (date-only or full datetime, "T" or space separator)
    try:
        return datetime.fromisoformat(text)
    except (TypeError, ValueError, OSError, OverflowError):
        pass

    # RFC 2822 / email dates (these always carry a time)
    try:
        parsed = parsedate_to_datetime(text)
        if parsed is not None:
            return parsed
    except (TypeError, ValueError, IndexError, AttributeError, OverflowError):
        pass

    for fmt in DATE_TIME_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue

    for fmt in DATE_ONLY_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue

    # Try parsing only the first token if datetime is appended in a format
    # we don't otherwise recognize (e.g. "2026-07-12 (IST)")
    try:
        return datetime.fromisoformat(text.split()[0])
    except (TypeError, ValueError, OSError, OverflowError):
        pass

    return None


def normalize_transaction_date(raw_date: Any) -> str:
    """Return a consistent YYYY-MM-DD string for all transaction dates.

    Time-of-day, if any, is intentionally discarded here -- use
    `normalize_transaction_datetime` wherever the time actually matters
    (e.g. persisting txn_date to the DB).
    """

    parsed = _parse_transaction_datetime(raw_date)
    if parsed is not None:
        return parsed.strftime("%Y-%m-%d")

    text = str(raw_date or "").strip()
    return text


def normalize_transaction_datetime(raw_date: Any) -> str:
    """Return YYYY-MM-DD HH:MM:SS when a time-of-day is present in the
    source value, otherwise plain YYYY-MM-DD."""

    parsed = _parse_transaction_datetime(raw_date)
    if parsed is not None:
        if parsed.time() == time.min:
            return parsed.strftime("%Y-%m-%d")
        return parsed.strftime("%Y-%m-%d %H:%M:%S")

    text = str(raw_date or "").strip()
    return text


def _column_name(column_number: int) -> str:
    name = ""
    while column_number:
        column_number, remainder = divmod(column_number - 1, 26)
        name = chr(65 + remainder) + name
    return name


def transaction_column_for_field(field_name: str) -> str:
    return _column_name(TRANSACTION_SCHEMA.index(field_name) + 1)


def _serialize_sheet_value(value: Any) -> str:
    if value is None:
        return ""

    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)

    if isinstance(value, bool):
        return "true" if value else "false"

    return str(value)


def transactions_to_sheet_rows(transactions: list[dict]) -> list[list[str]]:
    rows: list[list[str]] = []

    for transaction in transactions:
        if hasattr(transaction, "model_dump"):
            transaction = transaction.model_dump()

        transaction_type = (
            transaction.get("txn_type")
            or transaction.get("transaction_type")
        )

        if (
            not transaction_type
            or transaction_type.lower() not in VALID_TRANSACTION_TYPES
        ):
            continue

        normalized_transaction = dict(transaction)

        # Normalize transaction date before storing
        normalized_transaction["txn_date"] = normalize_transaction_date(
            normalized_transaction.get("txn_date")
        )

        rows.append([
            _serialize_sheet_value(normalized_transaction.get(column))
            for column in TRANSACTION_SCHEMA
        ])

    return rows


def _parse_json_cell(value: str) -> Any:
    if not value:
        return {}

    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return value


def parse_sheet_transaction_row(
    row: list[str],
    extra_fields: Mapping[str, Any] | None = None,
) -> dict | None:
    if not row:
        return None

    row_padded = row + [""] * (len(TRANSACTION_SCHEMA) - len(row))

    transaction = {
        column: row_padded[index]
        for index, column in enumerate(TRANSACTION_SCHEMA)
    }

    for field in JSON_TRANSACTION_FIELDS:
        transaction[field] = _parse_json_cell(transaction.get(field, ""))

    # Normalize txn_date after reading from sheet
    transaction["txn_date"] = normalize_transaction_date(
        transaction.get("txn_date")
    )

    if extra_fields:
        transaction.update(extra_fields)

    return transaction


def transaction_timestamp(transaction: dict) -> float:
    raw_date = transaction.get("txn_date") or ""

    if not raw_date:
        return 0

    normalized_date = normalize_transaction_date(raw_date)

    if normalized_date:
        try:
            return datetime.strptime(
                normalized_date,
                "%Y-%m-%d"
            ).timestamp()
        except (TypeError, ValueError, OSError, OverflowError):
            pass

    try:
        return datetime.fromisoformat(
            str(raw_date).replace("Z", "+00:00")
        ).timestamp()
    except (TypeError, ValueError, OSError, OverflowError):
        pass

    try:
        return parsedate_to_datetime(str(raw_date)).timestamp()
    except (TypeError, ValueError, IndexError, AttributeError, OverflowError):
        return 0
    

def normalize_txn_via(value: Any) -> str:
    compact_value = "".join(
        ch for ch in str(value or "").strip().lower()
        if ch.isalnum()
    )

    if compact_value == "creditcard":
        return "credit_card"
    if compact_value == "fastag":
        return "fastag"

    return compact_value


def is_fastag_transaction(transaction: dict) -> bool:
    return normalize_txn_via(transaction.get("txn_via")) == "fastag"
