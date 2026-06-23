import json
from datetime import datetime
from email.utils import parsedate_to_datetime
from typing import Any, Mapping

from ..ds.llm.schemas.transaction_schema import Transaction


TRANSACTION_SCHEMA = list(Transaction.model_fields.keys())
GMAIL_MESSAGE_ID_FIELD = "gmail_message_id"
GMAIL_MESSAGE_ID_COLUMN = "B"
JSON_TRANSACTION_FIELDS = {"email_metadata", "parser_metadata", "raw_data"}
VALID_TRANSACTION_TYPES = {"Debit", "Credit", "credit", "debit"}

def _column_name(column_number: int) -> str:
    name = ""
    while column_number:
        column_number, remainder = divmod(column_number - 1, 26)
        name = chr(65 + remainder) + name
    return name


TRANSACTION_SHEET_END_COLUMN = _column_name(len(TRANSACTION_SCHEMA))
TRANSACTION_HEADER_RANGE = f"A1:{TRANSACTION_SHEET_END_COLUMN}1"
TRANSACTION_DATA_RANGE = f"A2:{TRANSACTION_SHEET_END_COLUMN}"


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

        transaction_type = transaction.get("transaction_type")

        if not transaction_type or transaction_type.lower() not in VALID_TRANSACTION_TYPES:
            continue

        rows.append([
            _serialize_sheet_value(transaction.get(column))
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


def _parse_bool_cell(value: str) -> bool | str | None:
    normalized_value = str(value).strip().lower()
    if not normalized_value:
        return None
    if normalized_value in {"true", "yes", "1"}:
        return True
    if normalized_value in {"false", "no", "0"}:
        return False
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

    transaction["is_forwarded"] = _parse_bool_cell(transaction.get("is_forwarded", ""))

    if extra_fields:
        transaction.update(extra_fields)

    return transaction


def transaction_timestamp(transaction: dict) -> float:
    raw_date = transaction.get("txn_date") or ""
    if not raw_date:
        return 0

    try:
        return datetime.fromisoformat(str(raw_date).replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError, OSError, OverflowError):
        pass

    try:
        return parsedate_to_datetime(str(raw_date)).timestamp()
    except (TypeError, ValueError, IndexError, AttributeError, OverflowError):
        return 0
