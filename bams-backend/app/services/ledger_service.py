"""
Ledger service — persists extracted transactions (from either the email or
statement pipeline, same unified schema) into the `transactions` table, and
maintains a day-by-day running balance per account in `bank_accounts`.

Two distinct flows:

- Email flow (`persist_transactions_batch` / `persist_transaction`): we only
  ever see one alert at a time, with no authoritative balance. Each
  transaction's amount is applied incrementally (+credit/-debit) on top of
  whatever the account's running balance already is. A brand-new account
  with no prior day-row starts from 0.

- Statement flow (`reconcile_statement_batch`): a bank statement carries its
  own ground-truth `balance_after_txn` for every row, so we never compute it
  ourselves here. Statement rows are matched against transactions already
  inserted via the email flow (by ref_number, falling back to
  amount+txn_date+txn_time) — a match gets its balance corrected and any
  still-missing fields filled in, rather than being duplicated. Every day
  touched by the statement has its bank_accounts.current_balance overwritten
  with that day's true closing balance, correcting any drift from earlier
  incremental email-based estimates.

Day-bucketing rule: a `bank_accounts` row represents one account's balance
for one calendar day, keyed off the TRANSACTION's own txn_date — not the
wall-clock date we happen to process it on. This means backfilling an old
email correctly updates that historical day's row rather than today's.

Known limitation: correcting historical days via a statement does not cascade
forward into later day-rows that already exist beyond the statement's
coverage (e.g. from emails received after the statement period) — those keep
whatever opening balance they were created with. Worth a dedicated
reconciliation pass if that drift matters in practice.
"""

from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional
from uuid import uuid4

from sqlalchemy.orm import Session

from ..models.bank_accounts import BankAccounts
from ..models.transactions import Transactions
from ..utils.transaction_utils import normalize_transaction_date

PLACEHOLDER_TEXT = "N/A"

# transactions columns that are NOT NULL in the DB but not always filled by the LLM
REQUIRED_TEXT_FIELDS = (
    "bank_name",
    "account_holder_name",
    "account_number",
    "txn_type",
    "counterparty",
    "narration",
    "txn_via",
    "ref_number",
)

# fields a statement can fill in on an existing (email-sourced) row, but only
# where that row is currently empty/placeholder — never overwrites real data
FILLABLE_FIELDS = (
    "bank_name",
    "account_holder_name",
    "account_type",
    "mode",
    "category",
    "currency",
    "counterparty",
    "counterparty_kind",
    "narration",
    "txn_via",
    "place",
    "ref_number",
    "txn_time",
)


def _text(value: Any) -> str:
    text = str(value).strip() if value is not None else ""
    return text or PLACEHOLDER_TEXT


def _as_day(value: Any) -> Optional[date]:
    """Best-effort parse of a date-ish value (str/Timestamp/date) into a date."""
    if value is None:
        return None

    if isinstance(value, date) and not isinstance(value, datetime):
        return value

    if isinstance(value, datetime):
        return value.date()

    normalized = normalize_transaction_date(value)
    if not normalized:
        return None

    try:
        return datetime.strptime(normalized, "%Y-%m-%d").date()
    except ValueError:
        return None


def _as_decimal(value: Any) -> Optional[Decimal]:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _day_start(day: date) -> datetime:
    return datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)


# ------------------------------------------------------------------ #
# Daily balance ledger                                                #
# ------------------------------------------------------------------ #


def get_or_create_daily_balance(
    db: Session,
    account_number: str,
    day: date,
    bank_name: Optional[str] = None,
    account_holder_name: Optional[str] = None,
    account_type: Optional[str] = None,
) -> BankAccounts:
    """
    Fetch (or create) the bank_accounts row representing `account_number`'s
    balance on `day`. A new row's opening balance is carried forward from the
    closest earlier day-row for that account, or 0 if this account has never
    been seen before.
    """
    row_id = f"{account_number}_{day.strftime('%Y%m%d')}"

    existing = db.query(BankAccounts).filter(BankAccounts.id == row_id).first()
    if existing:
        return existing

    previous = (
        db.query(BankAccounts)
        .filter(
            BankAccounts.account_number == account_number,
            BankAccounts.created_at < _day_start(day),
        )
        .order_by(BankAccounts.created_at.desc())
        .first()
    )

    opening_balance = previous.current_balance if previous is not None else Decimal("0")

    new_row = BankAccounts(
        id=row_id,
        bank_name=bank_name or (previous.bank_name if previous else None) or "Unknown",
        account_holder_name=(
            account_holder_name or (previous.account_holder_name if previous else None) or "Unknown"
        ),
        account_type=account_type or (previous.account_type if previous else None),
        account_number=account_number,
        current_balance=opening_balance,
        statement_balance=previous.statement_balance if previous else None,
        last_synced_at=previous.last_synced_at if previous else None,
        source="",
        created_at=_day_start(day),
    )
    db.add(new_row)
    db.flush()
    return new_row


def apply_transaction_to_ledger(
    db: Session,
    account_number: str,
    txn_type: str,
    amount: Decimal,
    txn_day: date,
    bank_name: Optional[str] = None,
    account_holder_name: Optional[str] = None,
    account_type: Optional[str] = None,
) -> Decimal:
    """
    Apply one transaction's amount to the account's day-row and return the
    resulting balance. `txn_type` must already be normalized to "credit" or
    "debit". Used by the email flow only — statements carry their own
    authoritative balance and never go through this.
    """
    day_row = get_or_create_daily_balance(
        db,
        account_number=account_number,
        day=txn_day,
        bank_name=bank_name,
        account_holder_name=account_holder_name,
        account_type=account_type,
    )

    delta = amount if txn_type == "credit" else -amount
    day_row.current_balance = (day_row.current_balance or Decimal("0")) + delta
    day_row.updated_at = datetime.now(timezone.utc)

    db.flush()
    return day_row.current_balance


def set_daily_closing_balance(
    db: Session,
    account_number: str,
    day: date,
    closing_balance: Decimal,
    bank_name: Optional[str] = None,
    account_holder_name: Optional[str] = None,
    account_type: Optional[str] = None,
) -> BankAccounts:
    """
    Overwrite the day-row's current_balance with a known-true closing balance
    (from a statement), rather than computing it incrementally.
    """
    day_row = get_or_create_daily_balance(
        db,
        account_number=account_number,
        day=day,
        bank_name=bank_name,
        account_holder_name=account_holder_name,
        account_type=account_type,
    )
    day_row.current_balance = closing_balance
    day_row.updated_at = datetime.now(timezone.utc)
    db.flush()
    return day_row


# ------------------------------------------------------------------ #
# Shared row construction                                             #
# ------------------------------------------------------------------ #


def _build_transaction_row(transaction: Dict[str, Any], balance_after_txn: Optional[Decimal]) -> Transactions:
    parser_metadata = transaction.get("parser_metadata") or {}
    amount = _as_decimal(transaction.get("amount"))
    txn_day = _as_day(transaction.get("txn_date"))
    ref_number = _text(transaction.get("ref_number"))

    return Transactions(
        id=uuid4().hex,
        gmail_message_id=transaction.get("gmail_message_id"),
        bank_name=_text(transaction.get("bank_name")),
        account_holder_name=_text(transaction.get("account_holder_name")),
        account_type=transaction.get("account_type"),
        account_number=_text(transaction.get("account_number")),
        txn_type=_text(transaction.get("txn_type")),
        mode=transaction.get("mode"),
        category=transaction.get("category"),
        amount=amount,
        currency=transaction.get("currency") or "INR",
        txn_date=_day_start(txn_day) if txn_day else None,
        txn_time=transaction.get("txn_time"),
        counterparty=_text(transaction.get("counterparty")),
        counterparty_kind=transaction.get("counterparty_kind"),
        narration=_text(transaction.get("narration")),
        txn_via=_text(transaction.get("txn_via")),
        ref_number=ref_number,
        place=transaction.get("place"),
        balance_after_txn=balance_after_txn,
        source=transaction.get("source") or "",
        dedupe_key=ref_number,
        email_metadata=transaction.get("email_metadata") or {},
        parser_metadata=parser_metadata,
        optional_fields=transaction.get("optional_fields") or {},
    )


# ------------------------------------------------------------------ #
# Email flow — incremental balance                                    #
# ------------------------------------------------------------------ #


def persist_transaction(db: Session, transaction: Dict[str, Any]) -> Optional[Transactions]:
    """
    Insert one extracted transaction into `transactions`, updating the
    account's running balance in `bank_accounts` incrementally and writing
    that back as `balance_after_txn`.

    Returns None (no DB write) if:
      - it isn't a real parsed transaction, or
      - `amount` can't be parsed as a number (never fabricate a financial amount).
    """
    parser_metadata = transaction.get("parser_metadata") or {}
    if parser_metadata.get("parsed_status") != "parsed":
        return None

    amount = _as_decimal(transaction.get("amount"))
    if amount is None:
        return None

    txn_day = _as_day(transaction.get("txn_date"))
    account_number = transaction.get("account_number")
    txn_type_norm = str(transaction.get("txn_type") or "").strip().lower()

    balance_after_txn = None
    if account_number and txn_day and txn_type_norm in ("credit", "debit"):
        balance_after_txn = apply_transaction_to_ledger(
            db,
            account_number=account_number,
            txn_type=txn_type_norm,
            amount=amount,
            txn_day=txn_day,
            bank_name=transaction.get("bank_name"),
            account_holder_name=transaction.get("account_holder_name"),
            account_type=transaction.get("account_type"),
        )

    row = _build_transaction_row(transaction, balance_after_txn)

    db.add(row)
    db.commit()
    db.refresh(row)

    if balance_after_txn is not None:
        transaction["balance_after_txn"] = float(balance_after_txn)

    return row


def persist_transactions_batch(db: Session, transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Persist a batch of extracted email transactions. One bad row never
    aborts the rest of the batch.
    """
    persisted_ids: List[str] = []
    skipped: List[Dict[str, Any]] = []

    for transaction in transactions:
        try:
            row = persist_transaction(db, transaction)
        except Exception as exc:
            db.rollback()
            skipped.append({"reason": str(exc), "ref_number": transaction.get("ref_number")})
            continue

        if row is None:
            skipped.append({
                "reason": "not a parsed transaction, or amount could not be parsed",
                "ref_number": transaction.get("ref_number"),
            })
        else:
            persisted_ids.append(row.id)

    return {
        "persisted_count": len(persisted_ids),
        "persisted_ids": persisted_ids,
        "skipped_count": len(skipped),
        "skipped": skipped,
    }


# ------------------------------------------------------------------ #
# Statement flow — authoritative balance + monthly reconciliation     #
# ------------------------------------------------------------------ #


def _fallback_match_key(transaction: Dict[str, Any]) -> Optional[tuple]:
    account_number = transaction.get("account_number")
    amount = _as_decimal(transaction.get("amount"))
    txn_day = _as_day(transaction.get("txn_date"))
    if not account_number or amount is None or txn_day is None:
        return None
    return (account_number, amount, txn_day, transaction.get("txn_time") or None)


def _find_matching_transaction(
    db: Session,
    transaction: Dict[str, Any],
    occurrence_counter: Dict[tuple, int],
) -> Optional[Transactions]:
    """
    Look for an existing transactions row (typically inserted earlier from an
    email alert, or from a previous run of this same statement) that this
    statement row corresponds to.

    Primary key: ref_number.

    Fallback (no ref_number): account_number + amount + txn_date + txn_time.
    Most statement rows have no ref_number at all, and a statement can
    legitimately contain multiple transactions that share the same amount on
    the same day — so instead of matching "any" row with that key, we match
    the Nth occurrence of that key in this batch to the Nth existing row with
    that key (both ordered by id). This is what makes reprocessing the exact
    same statement idempotent (every row lines up with the one already
    inserted, no duplicates) while still keeping genuinely-distinct
    same-amount/same-day transactions from colliding with each other.
    """
    account_number = transaction.get("account_number")
    if not account_number:
        return None

    ref_number = str(transaction.get("ref_number") or "").strip()
    if ref_number and ref_number != PLACEHOLDER_TEXT:
        match = (
            db.query(Transactions)
            .filter(
                Transactions.account_number == account_number,
                Transactions.ref_number == ref_number,
            )
            .first()
        )
        if match:
            return match

    key = _fallback_match_key(transaction)
    if key is None:
        return None

    occurrence_index = occurrence_counter.get(key, 0)
    occurrence_counter[key] = occurrence_index + 1

    _, amount, txn_day, txn_time = key
    query = db.query(Transactions).filter(
        Transactions.account_number == account_number,
        Transactions.amount == amount,
        Transactions.txn_date == _day_start(txn_day),
    )
    if txn_time:
        query = query.filter(Transactions.txn_time == txn_time)
    else:
        query = query.filter(Transactions.txn_time.is_(None))

    candidates = query.order_by(Transactions.id).all()
    if occurrence_index < len(candidates):
        return candidates[occurrence_index]

    return None


def _fill_missing_fields(existing_row: Transactions, transaction: Dict[str, Any]) -> None:
    """Fill gaps on an existing row from the statement's version — never overwrites real data."""
    for field in FILLABLE_FIELDS:
        current = getattr(existing_row, field, None)
        if current is not None and current != PLACEHOLDER_TEXT and current != "":
            continue

        new_value = transaction.get(field)
        if new_value:
            setattr(existing_row, field, new_value)


def reconcile_statement_batch(db: Session, transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Reconcile a batch of statement-extracted transactions (typically a full
    month, uploaded at month-end) against what's already in `transactions`:

      - Matches an existing (email-sourced) row -> corrects balance_after_txn
        to the statement's true value and fills in any still-missing fields.
      - No match -> inserts a new row, trusting the statement's own balance
        directly (no incremental math needed).

    Every (account, day) touched by the statement then has its
    bank_accounts.current_balance overwritten with that day's true closing
    balance, correcting any drift from earlier email-based estimates. The
    most recent day per account also updates statement_balance/last_synced_at.
    """
    def _sort_key(t: Dict[str, Any]):
        day = _as_day(t.get("txn_date")) or date.min
        return (t.get("account_number") or "", day, t.get("txn_time") or "")

    ordered = sorted(transactions, key=_sort_key)

    updated_ids: List[str] = []
    inserted_ids: List[str] = []
    skipped: List[Dict[str, Any]] = []

    # (account_number, day) -> latest known true closing balance for that day
    day_closing_balance: Dict[tuple, Decimal] = {}
    # account_number -> {bank_name, account_holder_name, account_type}, so
    # brand-new bank_accounts day-rows created below aren't left as "Unknown"
    account_meta: Dict[str, Dict[str, Any]] = {}
    # (account, amount, day, time) -> how many times we've matched this key so far
    occurrence_counter: Dict[tuple, int] = {}

    for transaction in ordered:
        amount = _as_decimal(transaction.get("amount"))
        txn_day = _as_day(transaction.get("txn_date"))
        account_number = transaction.get("account_number")
        statement_balance = _as_decimal(transaction.get("balance_after_txn"))

        if amount is None or not account_number or txn_day is None:
            skipped.append({
                "reason": "missing amount, account_number, or txn_date",
                "ref_number": transaction.get("ref_number"),
            })
            continue

        if account_number not in account_meta:
            account_meta[account_number] = {
                "bank_name": transaction.get("bank_name"),
                "account_holder_name": transaction.get("account_holder_name"),
                "account_type": transaction.get("account_type"),
            }

        existing = _find_matching_transaction(db, transaction, occurrence_counter)

        if existing:
            if statement_balance is not None:
                existing.balance_after_txn = statement_balance
            _fill_missing_fields(existing, transaction)
            db.add(existing)
            db.flush()
            updated_ids.append(existing.id)
        else:
            row = _build_transaction_row(transaction, statement_balance)
            db.add(row)
            db.flush()
            inserted_ids.append(row.id)

        if statement_balance is not None:
            day_closing_balance[(account_number, txn_day)] = statement_balance

    # Repair every day-row the statement actually covers.
    last_day_per_account: Dict[str, date] = {}
    for (account_number, day), closing_balance in day_closing_balance.items():
        meta = account_meta.get(account_number, {})
        set_daily_closing_balance(
            db,
            account_number=account_number,
            day=day,
            closing_balance=closing_balance,
            bank_name=meta.get("bank_name"),
            account_holder_name=meta.get("account_holder_name"),
            account_type=meta.get("account_type"),
        )
        if account_number not in last_day_per_account or day > last_day_per_account[account_number]:
            last_day_per_account[account_number] = day

    # Refresh statement_balance/last_synced_at using each account's most recent day in this statement.
    for account_number, day in last_day_per_account.items():
        closing_balance = day_closing_balance[(account_number, day)]
        row_id = f"{account_number}_{day.strftime('%Y%m%d')}"
        day_row = db.query(BankAccounts).filter(BankAccounts.id == row_id).first()
        if day_row:
            day_row.statement_balance = closing_balance
            day_row.last_synced_at = _day_start(day)
            db.add(day_row)

    db.commit()

    return {
        "updated_count": len(updated_ids),
        "updated_ids": updated_ids,
        "inserted_count": len(inserted_ids),
        "inserted_ids": inserted_ids,
        "skipped_count": len(skipped),
        "skipped": skipped,
        "days_reconciled": [
            {"account_number": acc, "day": day.isoformat(), "closing_balance": float(bal)}
            for (acc, day), bal in day_closing_balance.items()
        ],
    }
