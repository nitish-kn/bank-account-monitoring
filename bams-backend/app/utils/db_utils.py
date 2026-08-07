from datetime import datetime
from decimal import Decimal, InvalidOperation
import difflib
import logging
from collections import Counter
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
from .transaction_utils import normalize_transaction_date, normalize_transaction_datetime

logger = logging.getLogger(__name__)


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

    # Preserve time-of-day when the source actually provides one -- plain
    # normalize_transaction_date() would silently truncate it to midnight.
    normalized = normalize_transaction_datetime(value)
    if not normalized:
        return None

    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(normalized, fmt)
        except (TypeError, ValueError):
            continue

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


def _account_numbers_compatible(left, right) -> bool:
    left_key = _compact_key(left)
    right_key = _compact_key(right)

    if not left_key or not right_key:
        return True
    if left_key == right_key:
        return True
    if len(left_key) >= 4 and len(right_key) >= 4 and (
        left_key in right_key or right_key in left_key
    ):
        return True

    left_digits = re.sub(r"\D+", "", left_key)
    right_digits = re.sub(r"\D+", "", right_key)
    if len(left_digits) >= 4 and len(right_digits) >= 4:
        return left_digits[-4:] == right_digits[-4:]

    return False


def _refs_have_subset_match(left, right, min_partial_len: int = 4) -> bool:
    left_ref = _compact_key(left)
    right_ref = _compact_key(right)

    if not left_ref or not right_ref or left_ref == right_ref:
        return False

    shorter, longer = sorted([left_ref, right_ref], key=len)
    if len(shorter) < min_partial_len:
        return False

    return shorter in longer


def _ref_match_kind(left, right) -> str | None:
    left_ref = _compact_key(left)
    right_ref = _compact_key(right)

    if not left_ref or not right_ref:
        return None
    if left_ref == right_ref:
        return "exact"
    if _refs_have_subset_match(left_ref, right_ref):
        return "subset"
    return None


def _preferred_ref_number(existing_ref, incoming_ref) -> str:
    """Keep the fuller reference number when a partial/full ref pair is matched."""

    existing_text = _clean_text(existing_ref)
    incoming_text = _clean_text(incoming_ref)
    existing_key = _compact_key(existing_text)
    incoming_key = _compact_key(incoming_text)

    if not existing_key:
        return incoming_text
    if not incoming_key:
        return existing_text
    if existing_key in incoming_key and len(incoming_key) > len(existing_key):
        return incoming_text
    return existing_text


def build_transaction_dedupe_key(transaction: dict, user_id: int) -> str:
    """It makes the dedupe key hashing them using some fields with sha256"""

    bank_name = _normal_key(transaction.get("bank_name"))
    account_number = _normal_key(transaction.get("account_number"))
    txn_type = _normal_key(transaction.get("txn_type"))
    amount = _amount_key(transaction.get("amount"))
    ref_number = _normal_key(transaction.get("ref_number"))
    txn_date = normalize_transaction_date(transaction.get("txn_date"))

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


def _account_bank_type_compatible(candidate: Transactions, transaction: dict) -> bool:
    txn_type = _normal_key(transaction.get("txn_type"))
    candidate_txn_type = _normal_key(candidate.txn_type)
    if txn_type and candidate_txn_type and candidate_txn_type != txn_type:
        return False

    if not _account_numbers_compatible(candidate.account_number, transaction.get("account_number")):
        return False

    bank_name = _normal_key(transaction.get("bank_name"))
    if (
        bank_name
        and candidate.bank_name
        and _normal_key(candidate.bank_name) != bank_name
        and not _similar_text(candidate.bank_name, transaction.get("bank_name"), threshold=0.85)
    ):
        return False

    return True


def _transaction_core_matches(candidate: Transactions, transaction: dict) -> bool:
    if not _account_bank_type_compatible(candidate, transaction):
        return False

    if not _dates_close(candidate.txn_date, transaction.get("txn_date"), max_days=3):
        return False

    return True


def _candidate_ref_match_score(
    candidate: Transactions,
    transaction: dict,
    match_kind: str,
) -> int | None:
    if not _transaction_core_matches(candidate, transaction):
        return None

    score = 100 if match_kind == "exact" else 70
    amount = _decimal_or_none(transaction.get("amount"))
    account_number = _normal_key(transaction.get("account_number"))
    bank_name = _normal_key(transaction.get("bank_name"))
    txn_type = _normal_key(transaction.get("txn_type"))

    if amount is not None and candidate.amount is not None and candidate.amount == amount:
        score += 10
    if account_number and _normal_key(candidate.account_number) == account_number:
        score += 8
    if txn_type and _normal_key(candidate.txn_type) == txn_type:
        score += 6
    if bank_name and _normal_key(candidate.bank_name) == bank_name:
        score += 4
    if _datetime_or_none(transaction.get("txn_date")) and candidate.txn_date:
        score += 2
    if _similar_text(candidate.counterparty, transaction.get("counterparty")):
        score += 1

    return score


def _find_ref_number_match(
    transaction: dict, user_id: int, db: Session
) -> tuple[Transactions | None, str | None]:
    """Find an existing row by exact/subset ref before building a new dedupe key.

    Returns (candidate, match_kind) where match_kind is "exact" or "subset" —
    a subset match (e.g. a previously-stored 16-digit ref vs. a newly-arrived
    12-digit ref that's fully contained in it) is lower confidence than an
    exact match, and callers use match_kind to decide whether to flag it.
    """

    ref_number = transaction.get("ref_number")

    if not _compact_key(ref_number):
        return None, None

    query = db.query(Transactions).filter(
        Transactions.user_id == user_id,
        Transactions.ref_number.isnot(None),
    )

    candidates = query.all()
    matches: list[tuple[int, int, str, Transactions]] = []

    for candidate in candidates:
        match_kind = _ref_match_kind(candidate.ref_number, ref_number)
        if not match_kind:
            continue

        score = _candidate_ref_match_score(candidate, transaction, match_kind)
        if score is None:
            continue

        matches.append((score, len(_compact_key(candidate.ref_number)), match_kind, candidate))

    if not matches:
        return None, None

    best = max(matches, key=lambda item: (item[0], item[1]))
    return best[3], best[2]


def _find_fallback_amount_date_match(
    transaction: dict, user_id: int, db: Session
) -> Transactions | None:
    """Used only when the incoming transaction has no ref_number at all.

    The only remaining signal is an exact amount match + exact calendar-date
    match (account/bank/txn_type compatible) — no day-window leniency here,
    unlike the ref-match path. A different amount or a different date always
    means a distinct transaction; counterparty similarity (>=70%) only
    contributes to tie-breaking between multiple same-amount/same-day
    candidates, never gates the match on its own.
    """

    amount = _decimal_or_none(transaction.get("amount"))
    txn_dt = _datetime_or_none(transaction.get("txn_date"))
    if amount is None or txn_dt is None:
        return None

    candidates = (
        db.query(Transactions)
        .filter(
            Transactions.user_id == user_id,
            Transactions.amount == amount,
            Transactions.txn_date.isnot(None),
        )
        .all()
    )

    matches: list[tuple[int, Transactions]] = []
    for candidate in candidates:
        if candidate.txn_date.date() != txn_dt.date():
            continue
        if not _account_bank_type_compatible(candidate, transaction):
            continue

        score = 1
        if _similar_text(candidate.counterparty, transaction.get("counterparty")):
            score += 1
        matches.append((score, candidate))

    if not matches:
        return None

    return max(matches, key=lambda item: item[0])[1]


TEXT_PLACEHOLDERS_BY_FIELD = {
    "account_holder_name": {"customer"},
    "counterparty": {"unknown"},
    "narration": {"bank transaction"},
    "txn_via": {"bank transaction"},
}


def _field_value_missing(field_name: str, value) -> bool:
    if value is None:
        return True

    if isinstance(value, str):
        normalized = _normal_key(value)
        if not normalized:
            return True
        return normalized in TEXT_PLACEHOLDERS_BY_FIELD.get(field_name, set())

    return False


def _assign_model_field(
    model: Transactions,
    field_name: str,
    value,
    fill_missing_only: bool,
) -> bool:
    """Sets the field and returns True iff it actually changed the model."""

    if fill_missing_only:
        if _field_value_missing(field_name, value):
            return False
        if not _field_value_missing(field_name, getattr(model, field_name)):
            return False
        setattr(model, field_name, value)
        return True

    changed = getattr(model, field_name) != value
    setattr(model, field_name, value)
    return changed


def _merge_missing_dict_values(existing, incoming) -> dict:
    merged = dict(existing or {})

    for key, value in dict(incoming or {}).items():
        if _field_value_missing(str(key), value):
            continue
        if _field_value_missing(str(key), merged.get(key)):
            merged[key] = value

    return merged


IMPORTANT_FIELDS = ("account_number", "account_holder_name", "counterparty")


def _has_missing_important_field(model: Transactions) -> bool:
    return any(
        _field_value_missing(field, getattr(model, field, None))
        for field in IMPORTANT_FIELDS
    )


def _apply_transaction_fields(
    model: Transactions,
    transaction: dict,
    user_id: int,
    fill_missing_only: bool = False,
) -> bool:
    """Applies `transaction`'s fields onto `model` and returns True iff
    anything about the model actually changed (a brand-new row always
    counts as changed; a fill-missing-only merge only counts as changed
    if it actually filled in something that was previously empty)."""

    changed = False
    amount = _decimal_or_none(transaction.get("amount"))

    model.user_id = user_id
    field_values = {
        "gmail_message_id": _clean_text(transaction.get("gmail_message_id")) or None,
        "bank_name": _clean_text(transaction.get("bank_name")),
        "account_holder_name": _clean_text(transaction.get("account_holder_name")) or "Customer",
        "account_type": _clean_text(transaction.get("account_type")) or None,
        "account_number": _clean_text(transaction.get("account_number")),
        "txn_type": _clean_text(transaction.get("txn_type")),
        "mode": _clean_text(transaction.get("mode")) or None,
        "category": _clean_text(transaction.get("category")) or None,
        "amount": amount,
        "currency": _clean_text(transaction.get("currency")) or "INR",
        "txn_date": _datetime_or_none(transaction.get("txn_date")),
        "counterparty": _clean_text(transaction.get("counterparty")) or "Unknown",
        "counterparty_kind": _clean_text(transaction.get("counterparty_kind")) or None,
        "narration": _clean_text(transaction.get("narration")) or "Bank transaction",
        "txn_via": _clean_text(transaction.get("txn_via")) or "Bank Transaction",
        "place": _clean_text(transaction.get("place")) or None,
        "balance_after_txn": _decimal_or_none(transaction.get("balance_after_txn")),
        "source": _clean_text(transaction.get("source")) or "email",
    }

    for field_name, value in field_values.items():
        if _assign_model_field(model, field_name, value, fill_missing_only):
            changed = True

    incoming_ref_number = _clean_text(transaction.get("ref_number"))
    if fill_missing_only:
        preferred_ref = _preferred_ref_number(model.ref_number, incoming_ref_number)
        if preferred_ref and preferred_ref != model.ref_number:
            model.ref_number = preferred_ref
            changed = True
    else:
        if model.ref_number != incoming_ref_number:
            changed = True
        model.ref_number = incoming_ref_number
        model.dedupe_key = transaction.get("dedupe_key") or build_transaction_dedupe_key(transaction, user_id)

    if not fill_missing_only and not getattr(model, "dedupe_key", None):
        model.dedupe_key = transaction.get("dedupe_key") or build_transaction_dedupe_key(transaction, user_id)

    incoming_email_metadata = transaction.get("email_metadata") or {}
    incoming_parser_metadata = transaction.get("parser_metadata") or {}
    incoming_optional_fields = _transaction_optional_fields(transaction)

    if fill_missing_only:
        merged_email = _merge_missing_dict_values(model.email_metadata, incoming_email_metadata)
        if merged_email != (model.email_metadata or {}):
            changed = True
        model.email_metadata = merged_email

        merged_parser = _merge_missing_dict_values(model.parser_metadata, incoming_parser_metadata)
        if merged_parser != (model.parser_metadata or {}):
            changed = True
        model.parser_metadata = merged_parser

        merged_optional = _merge_missing_dict_values(model.optional_fields, incoming_optional_fields)
        if merged_optional != (model.optional_fields or {}):
            changed = True
        model.optional_fields = merged_optional
    else:
        model.email_metadata = incoming_email_metadata
        model.parser_metadata = incoming_parser_metadata
        # model.raw_data = transaction.get("raw_data") or {}
        model.optional_fields = incoming_optional_fields
        changed = True

    return changed


def save_valid_transaction_to_db(transactions: list[dict], user_id: int, db: Session) -> list[Transactions]:
    """Insert or update valid parsed transactions. Caller owns commit/rollback.
    It only saves transaction with parsed_status == "parsed".

    Dedup policy:
      1. Ref number present -> only a ref-based match counts. An exact ref
         match merges silently (is_flag stays as computed below); a subset
         match (e.g. a stored 16-digit ref vs. an arriving 12-digit ref fully
         contained in it) merges but is flagged as lower confidence. A ref
         that matches nothing existing is confidently a new, distinct
         transaction -- never falls back to the amount/date guess.
      2. Ref number absent -> the only signal left is an exact amount +
         exact calendar-date match (account/bank/type compatible). Any
         mismatch on amount or date means "new". A match here is always
         flagged (no ref number ever backs it with full confidence).
      3. Whether or not any of the above matched, the row is also flagged if
         an important field (account_number, account_holder_name,
         counterparty) is still missing after applying this transaction's
         fields -- independent of duplicate-confidence.

    Each returned Transactions object carries two transient (non-persisted)
    markers for callers that need to know "is this actually new information":
      - `_is_insert`: True only for a brand-new row.
      - `_has_new_data`: True if a merge actually changed something (e.g.
        filled a previously-empty field) -- a true no-op duplicate resubmit
        leaves this False.
    """
    saved_transactions: list[Transactions] = []
    parsed_input_count = 0
    inserted_count = 0
    updated_count = 0
    flagged_count = 0
    skipped_count = 0

    for transaction in transactions or []:
        status = normalize_parsed_status(
            (transaction.get("parser_metadata") or {}).get("parsed_status")
        )
        if status != PARSED_STATUS:
            skipped_count += 1
            continue

        parsed_input_count += 1

        model: Transactions | None = None
        is_insert = True
        is_flag = False

        if _compact_key(transaction.get("ref_number")):
            ref_match, match_kind = _find_ref_number_match(transaction, user_id, db)
            if ref_match:
                transaction = {
                    **transaction,
                    "dedupe_key": ref_match.dedupe_key,
                    "ref_number": _preferred_ref_number(
                        ref_match.ref_number,
                        transaction.get("ref_number"),
                    ),
                }
                model = ref_match
                is_insert = False
                is_flag = match_kind == "subset"
        else:
            fallback_match = _find_fallback_amount_date_match(transaction, user_id, db)
            if fallback_match:
                transaction = {**transaction, "dedupe_key": fallback_match.dedupe_key}
                model = fallback_match
                is_insert = False
                is_flag = True

        if model is None:
            # Safety-net exact lookup by the stable dedupe key, so a literal
            # re-submission of the same transaction dict never creates a
            # second row even if the paths above didn't already catch it.
            dedupe_key = transaction.get("dedupe_key") or build_transaction_dedupe_key(transaction, user_id)
            existing = (
                db.query(Transactions)
                .filter(
                    Transactions.user_id == user_id,
                    Transactions.dedupe_key == dedupe_key,
                )
                .first()
            )
            transaction = {**transaction, "dedupe_key": dedupe_key}
            model = existing or Transactions(id=str(uuid4()))
            is_insert = existing is None

        changed = _apply_transaction_fields(
            model,
            transaction,
            user_id,
            fill_missing_only=not is_insert,
        )

        if _has_missing_important_field(model):
            is_flag = True
        model.is_flag = is_flag

        model._is_insert = is_insert
        model._has_new_data = changed

        db.add(model)
        db.flush()
        saved_transactions.append(model)
        if is_insert:
            inserted_count += 1
        elif is_flag:
            flagged_count += 1
        else:
            updated_count += 1

    if transactions:
        logger.info(
            "Transactions DB | user=%s parsed_valid=%d inserted=%d updated=%d flagged_duplicates=%d skipped_non_parsed=%d",
            user_id, parsed_input_count, inserted_count, updated_count, flagged_count, skipped_count,
        )

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
    force: bool = False,
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
        # Normally "parsed" is sticky (see _choose_status) so a later partial
        # result can't downgrade an already-successful message. `force`
        # bypasses that — used when the caller already knows the definitive
        # outcome and needs it to stick regardless of what's there.
        parsed.status = status if force else _choose_status(parsed.status, status)
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
    force_status: str | None = None,
) -> list[Parsed]:
    """Upsert one parse-status row per Gmail message. Caller owns commit/rollback.

    force_status, if given, is written for every email in `emails` as-is,
    skipping the per-transaction status aggregation below and the "parsed
    wins" merge in _upsert_parsed_status. Use it when the caller already
    knows the definitive outcome — e.g. a statement email where one
    attachment parsed but another didn't: the successful transactions still
    get saved elsewhere, but the message itself should still show as
    failed so the problem isn't hidden by the partial success. `error`
    becomes that row's `optional.error` note when forcing.
    """
    parsed_rows: list[Parsed] = []
    status_by_message_id: dict[str, tuple[str, dict | None]] = {}

    if force_status:
        for email in emails or []:
            gmail_message_id = _clean_text(email.get("id"))
            if gmail_message_id:
                status_by_message_id[gmail_message_id] = (
                    force_status,
                    {"error": error} if error else None,
                )
    else:
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

    existing_message_ids = set()
    if status_by_message_id:
        message_ids = list(status_by_message_id.keys())
        existing_message_ids = {
            row.gmail_message_id
            for row in db.query(Parsed.gmail_message_id)
            .filter(
                Parsed.user_id == user_id,
                Parsed.gmail_message_id.in_(message_ids),
            )
            .all()
        }

    inserted_count = 0
    updated_count = 0
    status_counts = Counter()

    for gmail_message_id, (status, optional) in status_by_message_id.items():
        if gmail_message_id in existing_message_ids:
            updated_count += 1
        else:
            inserted_count += 1

        status_counts[status] += 1
        parsed_rows.append(
            _upsert_parsed_status(
                user_id=user_id,
                gmail_message_id=gmail_message_id,
                status=status,
                db=db,
                optional=optional,
                force=bool(force_status),
            )
        )

    if status_by_message_id:
        status_summary = " ".join(
            f"{status}={count}"
            for status, count in sorted(status_counts.items())
        )
        logger.info(
            "Parsed status DB | user=%s inserted=%d updated=%d %s",
            user_id, inserted_count, updated_count, status_summary,
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
        "source": transaction.source,
        "dedupe_key": transaction.dedupe_key,
        "email_metadata": transaction.email_metadata or {},
        "parser_metadata": transaction.parser_metadata or {},
        "optional_fields": optional_fields,
        # "raw_data": transaction.raw_data or {},
        "is_flag": False,
    }

    for field in TRANSACTION_SCHEMA:
        if field not in data or data[field] in (None, ""):
            data[field] = optional_fields.get(field)

    result = {field: data.get(field) for field in TRANSACTION_SCHEMA}
    result["is_flag"] = False
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


# def transaction_summary(user_id:int, db:Session):
