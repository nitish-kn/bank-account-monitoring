from datetime import datetime
from decimal import Decimal, InvalidOperation
import difflib
from hashlib import sha256
import re
from uuid import uuid4

from sqlalchemy.orm import Session

from ..core.constants import (
    FAILED_STATUS,
    NOT_TRANSACTION_STATUS,
    PARSED_STATUS,
    STATUS_ALIASES,
    TRANSACTION_DB_FIELDS,
    TRANSACTION_SCHEMA,
)
from ..models.parsed import Parsed
from ..models.transactions import Transactions
from .date_utils import utc_now
from .transaction_utils import normalize_transaction_date


def normalize_parsed_status(status: str | None) -> str:
    """ Normalize parsed status, so DB can store consistent status values."""

    normalized = str(status or "").strip().lower()
    return STATUS_ALIASES.get(normalized, FAILED_STATUS)


def check_existing_gmail_message_id(user, db: Session) -> set[str]:
    """Return all Gmail message IDs already recorded in the parse-status table."""
    return {
        row.gmail_message_id
        for row in db.query(Parsed.gmail_message_id)
        .filter(Parsed.user_id == user.id)
        .all()
        if row.gmail_message_id
    }


def _clean_text(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _normal_key(value) -> str:
    return " ".join(_clean_text(value).lower().split())


def _compact_key(value) -> str:
    return re.sub(r"[^a-z0-9]+", "", _clean_text(value).lower())


def _decimal_or_none(value) -> Decimal | None:
    if value is None:
        return None

    text = str(value).strip()
    if not text:
        return None

    text = (
        text.replace(",", "")
        .replace("₹", "")
        .replace("INR", "")
        .strip()
    )

    try:
        return Decimal(text)
    except (InvalidOperation, ValueError):
        return None


def _datetime_or_none(value) -> datetime | None:
    if value is None or isinstance(value, datetime):
        return value

    normalized = normalize_transaction_date(value)
    if not normalized:
        return None

    try:
        return datetime.strptime(normalized, "%Y-%m-%d")
    except (TypeError, ValueError):
        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            return None


def _amount_key(value) -> str:
    amount = _decimal_or_none(value)
    if amount is None:
        return ""
    return str(amount.quantize(Decimal("0.01")))


def _dates_close(left, right, max_days: int = 1) -> bool:
    left_dt = _datetime_or_none(left)
    right_dt = _datetime_or_none(right)

    if not left_dt or not right_dt:
        return True

    return abs((left_dt.date() - right_dt.date()).days) <= max_days


def _similar_text(left, right, threshold: float = 0.70) -> bool:
    left_key = _compact_key(left)
    right_key = _compact_key(right)

    if not left_key or not right_key:
        return True

    if left_key in right_key or right_key in left_key:
        return True

    return difflib.SequenceMatcher(None, left_key, right_key).ratio() >= threshold


def _refs_have_subset_match(left, right, min_partial_len: int = 4) -> bool:
    left_ref = _compact_key(left)
    right_ref = _compact_key(right)

    if not left_ref or not right_ref or left_ref == right_ref:
        return False

    shorter, longer = sorted([left_ref, right_ref], key=len)
    if len(shorter) < min_partial_len:
        return False

    return shorter in longer


def build_transaction_dedupe_key(transaction: dict, user_id: int) -> str:
    """It makes the dedupe key hashing them using some fields with sha256"""

    bank_name = _normal_key(transaction.get("bank_name"))
    account_number = _normal_key(transaction.get("account_number"))
    txn_type = _normal_key(transaction.get("txn_type"))
    amount = _amount_key(transaction.get("amount"))
    ref_number = _normal_key(transaction.get("ref_number"))

    if ref_number:
        # If ref_number exists, it creates a strong key using - user_id + bank + account + txn_type + amount + ref_number
        raw_key = "|".join([
            "strong",
            str(user_id),
            bank_name,
            account_number,
            txn_type,
            amount,
            ref_number,
        ])

    else:
        # If ref is missing, it uses fallback fields - user_id + bank + account + txn_type + amount + date + counterparty + txn_via
        txn_date = normalize_transaction_date(transaction.get("txn_date"))
        counterparty = _normal_key(transaction.get("counterparty"))
        txn_via = _normal_key(
            transaction.get("txn_via")
            or transaction.get("mode")
            or transaction.get("category")
        )
        raw_key = "|".join([
            "weak",
            str(user_id),
            bank_name,
            account_number,
            txn_type,
            amount,
            txn_date,
            counterparty,
            txn_via,
        ])

    return sha256(raw_key.encode("utf-8")).hexdigest()


def _transaction_optional_fields(transaction: dict) -> dict:
    optional_fields = dict(transaction.get("optional_fields") or {})

    for key, value in transaction.items():
        if key not in TRANSACTION_DB_FIELDS and value is not None:
            optional_fields[key] = value

    return optional_fields


def _transaction_core_matches(candidate: Transactions, transaction: dict) -> bool:
    amount = _decimal_or_none(transaction.get("amount"))
    if amount is None or candidate.amount != amount:
        return False

    txn_type = _normal_key(transaction.get("txn_type"))
    if txn_type and _normal_key(candidate.txn_type) != txn_type:
        return False

    account_number = _normal_key(transaction.get("account_number"))
    if account_number and _normal_key(candidate.account_number) != account_number:
        return False

    bank_name = _normal_key(transaction.get("bank_name"))
    if bank_name and candidate.bank_name and _normal_key(candidate.bank_name) != bank_name:
        return False

    if not _dates_close(candidate.txn_date, transaction.get("txn_date")):
        return False

    if not _similar_text(candidate.counterparty, transaction.get("counterparty")):
        return False

    return True


def _find_ref_subset_matches(transaction: dict, user_id: int, db: Session) -> list[Transactions]:
    amount = _decimal_or_none(transaction.get("amount"))
    ref_number = transaction.get("ref_number")

    if amount is None or not _compact_key(ref_number):
        return []

    query = db.query(Transactions).filter(
        Transactions.user_id == user_id,
        Transactions.amount == amount,
    )

    account_number = _clean_text(transaction.get("account_number"))
    if account_number:
        query = query.filter(Transactions.account_number == account_number)

    candidates = query.all()

    return [
        candidate
        for candidate in candidates
        if _refs_have_subset_match(candidate.ref_number, ref_number)
        and _transaction_core_matches(candidate, transaction)
    ]


def _apply_transaction_fields(model: Transactions, transaction: dict, user_id: int) -> None:
    amount = _decimal_or_none(transaction.get("amount"))
    if amount is None:
        raise ValueError("Parsed transaction is missing a valid amount.")

    model.user_id = user_id
    model.gmail_message_id = _clean_text(transaction.get("gmail_message_id")) or None
    model.bank_name = _clean_text(transaction.get("bank_name"))
    model.account_holder_name = _clean_text(transaction.get("account_holder_name")) or "Customer"
    model.account_type = _clean_text(transaction.get("account_type")) or None
    model.account_number = _clean_text(transaction.get("account_number"))
    model.txn_type = _clean_text(transaction.get("txn_type"))
    model.mode = _clean_text(transaction.get("mode")) or None
    model.category = _clean_text(transaction.get("category")) or None
    model.amount = amount
    model.currency = _clean_text(transaction.get("currency")) or "INR"
    model.txn_date = _datetime_or_none(transaction.get("txn_date"))
    model.counterparty = _clean_text(transaction.get("counterparty")) or "Unknown"
    model.counterparty_kind = _clean_text(transaction.get("counterparty_kind")) or None
    model.narration = _clean_text(transaction.get("narration")) or "Bank transaction"
    model.txn_via = _clean_text(transaction.get("txn_via")) or "Bank Transaction"
    model.ref_number = _clean_text(transaction.get("ref_number"))
    model.place = _clean_text(transaction.get("place")) or None
    model.balance_after_txn = _decimal_or_none(transaction.get("balance_after_txn"))
    model.source = _clean_text(transaction.get("source")) or "email"
    model.dedupe_key = transaction.get("dedupe_key") or build_transaction_dedupe_key(transaction, user_id)
    model.email_metadata = transaction.get("email_metadata") or {}
    model.parser_metadata = transaction.get("parser_metadata") or {}
    model.raw_data = transaction.get("raw_data") or {}
    model.optional_fields = _transaction_optional_fields(transaction)
    model.is_flag = bool(transaction.get("is_flag")) or bool(getattr(model, "is_flag", False))


def save_valid_transaction_to_db(transactions: list[dict], user_id: int, db: Session) -> list[Transactions]:
    """Insert or update valid parsed transactions. Caller owns commit/rollback.
    It only saves transaction with parsed_status == "parsed" """
    saved_transactions: list[Transactions] = []

    for transaction in transactions or []:
        status = normalize_parsed_status(
            (transaction.get("parser_metadata") or {}).get("parsed_status")
        )
        if status != PARSED_STATUS:
            continue

        # It checks existing transaction by: user_id + dedupe_key
        # If found, it updates. If not found, it inserts a new Transactions row
        dedupe_key = transaction.get("dedupe_key") or build_transaction_dedupe_key(transaction, user_id)
        existing = (
            db.query(Transactions)
            .filter(
                Transactions.user_id == user_id,
                Transactions.dedupe_key == dedupe_key,
            )
            .first()
        )

        ref_subset_matches = [] if existing else _find_ref_subset_matches(transaction, user_id, db)
        model = existing or Transactions(id=str(uuid4()))

        if ref_subset_matches:
            transaction = {**transaction, "is_flag": True}
            for flagged_transaction in ref_subset_matches:
                flagged_transaction.is_flag = True
                db.add(flagged_transaction)

        transaction = {**transaction, "dedupe_key": dedupe_key}
        _apply_transaction_fields(model, transaction, user_id)

        db.add(model)
        db.flush()
        saved_transactions.append(model)

    return saved_transactions


def _choose_status(current_status: str | None, incoming_status: str) -> str:
    if current_status == PARSED_STATUS:
        return current_status
    if incoming_status == PARSED_STATUS:
        return incoming_status
    if current_status == NOT_TRANSACTION_STATUS:
        return current_status
    return incoming_status


def _upsert_parsed_status(
    user_id: int,
    gmail_message_id: str,
    status: str,
    db: Session,
    optional: dict | None = None,
) -> Parsed:
    parsed = (
        db.query(Parsed)
        .filter(
            Parsed.user_id == user_id,
            Parsed.gmail_message_id == gmail_message_id,
        )
        .first()
    )

    if parsed:
        parsed.status = _choose_status(parsed.status, status)
        parsed.optional = optional
    else:
        parsed = Parsed(
            id=str(uuid4()),
            user_id=user_id,
            gmail_message_id=gmail_message_id,
            status=status,
            optional=optional,
        )

    db.add(parsed)
    return parsed


def update_parsed_status_to_db(
    user_id: int,
    transactions: list[dict],
    db: Session,
    emails: list[dict] | None = None,
    error: str | None = None,
) -> list[Parsed]:
    """Upsert one parse-status row per Gmail message. Caller owns commit/rollback."""
    parsed_rows: list[Parsed] = []
    status_by_message_id: dict[str, tuple[str, dict | None]] = {}

    for transaction in transactions or []:
        gmail_message_id = _clean_text(transaction.get("gmail_message_id"))
        if not gmail_message_id:
            continue

        status = normalize_parsed_status(
            (transaction.get("parser_metadata") or {}).get("parsed_status")
        )
        existing = status_by_message_id.get(gmail_message_id)
        chosen_status = _choose_status(existing[0], status) if existing else status
        optional = None if chosen_status in {PARSED_STATUS, NOT_TRANSACTION_STATUS} else transaction
        status_by_message_id[gmail_message_id] = (chosen_status, optional)

    if error:
        for email in emails or []:
            gmail_message_id = _clean_text(email.get("id"))
            if gmail_message_id and gmail_message_id not in status_by_message_id:
                status_by_message_id[gmail_message_id] = (
                    FAILED_STATUS,
                    {"error": error},
                )

    for email in emails or []:
        gmail_message_id = _clean_text(email.get("id"))
        if gmail_message_id and gmail_message_id not in status_by_message_id:
            status_by_message_id[gmail_message_id] = (
                FAILED_STATUS,
                {"error": "LLM response did not include this Gmail message ID."},
            )

    for gmail_message_id, (status, optional) in status_by_message_id.items():
        parsed_rows.append(
            _upsert_parsed_status(
                user_id=user_id,
                gmail_message_id=gmail_message_id,
                status=status,
                db=db,
                optional=optional,
            )
        )

    return parsed_rows


def transaction_to_schema_dict(transaction: Transactions) -> dict:
    """ Converts a DB Transactions object back into your transaction_schema shape.
        This is used before sending data to frontend or Sheets. """
    
    optional_fields = transaction.optional_fields or {}

    data = {
        "id": transaction.id,
        "gmail_message_id": transaction.gmail_message_id,
        "bank_name": transaction.bank_name,
        "account_holder_name": transaction.account_holder_name,
        "account_number": transaction.account_number,
        "account_type": transaction.account_type,
        "txn_type": transaction.txn_type,
        "mode": transaction.mode,
        "category": transaction.category,
        "amount": str(transaction.amount) if transaction.amount is not None else None,
        "currency": transaction.currency,
        "txn_date": transaction.txn_date,
        "counterparty": transaction.counterparty,
        "counterparty_kind": transaction.counterparty_kind,
        "txn_via": transaction.txn_via,
        "ref_number": transaction.ref_number,
        "balance_after_txn": (
            str(transaction.balance_after_txn)
            if transaction.balance_after_txn is not None
            else None
        ),
        "place": transaction.place,
        "narration": transaction.narration,
        "email_metadata": transaction.email_metadata or {},
        "parser_metadata": transaction.parser_metadata or {},
        "raw_data": transaction.raw_data or {},
        "is_flag": transaction.is_flag,
    }

    for field in [*TRANSACTION_SCHEMA, "is_flag"]:
        if field not in data or data[field] in (None, ""):
            data[field] = optional_fields.get(field)

    result = {field: data.get(field) for field in TRANSACTION_SCHEMA}
    result["is_flag"] = bool(data.get("is_flag"))
    return result


def get_unsynced_transactions_for_user(
    user_id: int,
    db: Session,
    transaction_ids: list[str] | None = None,
) -> list[Transactions]:
    """ Finds DB transactions where sheets_synced_at IS NULL
        These are rows saved in DB but not yet written to Google Sheets"""
    
    query = db.query(Transactions).filter(
        Transactions.user_id == user_id,
        Transactions.sheets_synced_at.is_(None),
    )

    if transaction_ids:
        query = query.filter(Transactions.id.in_(transaction_ids))

    return query.order_by(Transactions.created_at.asc()).all()


def mark_transactions_sheet_synced(
    transactions: list[Transactions],
    db: Session,
) -> None:
    """ After Sheets append succeeds, this sets: sheets_synced_at = now()
        So those rows won’t be appended again."""
    
    synced_at = utc_now()
    for transaction in transactions:
        transaction.sheets_synced_at = synced_at
        db.add(transaction)
