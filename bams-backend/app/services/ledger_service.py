"""
Ledger service — maintains a day-by-day running balance per account in
`bank_accounts`. This service NEVER writes to the `transactions` table.
Extracted/parsed transactions are only ever returned back to the caller
(as plain dicts), fully calculated and deduplicated/merged in memory —
persisting them anywhere else is the caller's responsibility.

Two distinct flows:

- Email flow (`persist_transactions_batch` / `persist_transaction`): we only
  ever see one alert at a time, with no authoritative balance. Each
  transaction's amount is applied incrementally (+credit/-debit) on top of
  whatever the account's running balance already is. A brand-new account
  with no prior day-row starts from 0. The resulting `balance_after_txn` is
  written back onto the transaction dict (in place) — not to any DB row.

- Statement flow (`reconcile_statement_batch`): a bank statement carries its
  own ground-truth `balance_after_txn` for every row, so we never compute it
  ourselves here. Statement rows are still matched (read-only) against
  transactions already present in the `transactions` table — by ref_number,
  falling back to account_number+amount+txn_date — purely so we can enrich the
  in-memory transaction dict with any fields it's missing that the matched
  row already has. Nothing is written back to that matched row, and no new
  row is ever inserted. Every day touched by the statement has its
  bank_accounts.current_balance overwritten with that day's true closing
  balance, correcting any drift from earlier incremental email-based
  estimates.

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

from sqlalchemy.orm import Session

from ..models.bank_accounts import BankAccounts
from ..models.transactions import Transactions
from ..utils.transaction_utils import normalize_transaction_date

PLACEHOLDER_TEXT = "N/A"
VALID_LEDGER_TXN_TYPES = {"credit", "debit"}

# fields a matched, already-recorded transaction can fill in on the
# in-memory transaction dict being returned, but only where the dict is
# currently empty/placeholder for that field — never overwrites data the
# incoming transaction already carries
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
)


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


def _is_empty(value: Any) -> bool:
    return value is None or value == "" or value == PLACEHOLDER_TEXT


# ------------------------------------------------------------------ #
# Daily balance ledger (the only thing this module writes to DB)      #
# ------------------------------------------------------------------ #


def get_or_create_daily_balance(
    db: Session,
    user_id: int,
    account_number: str,
    day: date,
    bank_name: Optional[str] = None,
    account_holder_name: Optional[str] = None,
    account_type: Optional[str] = None,
    source: Optional[str] = None,
) -> tuple[BankAccounts, bool]:
    """
    Fetch (or create) the bank_accounts row representing `account_number`'s
    balance on `day`. A new row's opening balance is carried forward from the
    closest earlier day-row for that account, or 0 if this account has never
    been seen before.
    """
    row_id = f"{user_id}_{account_number}_{day.strftime('%Y%m%d')}"

    existing = (
        db.query(BankAccounts)
        .filter(
            BankAccounts.id == row_id,
            BankAccounts.user_id == user_id,
        )
        .first()
    )
    if existing:
        if bank_name and (not existing.bank_name or existing.bank_name == "Unknown"):
            existing.bank_name = bank_name
        if account_holder_name and (
            not existing.account_holder_name
            or existing.account_holder_name == "Unknown"
        ):
            existing.account_holder_name = account_holder_name
        if account_type and not existing.account_type:
            existing.account_type = account_type
        if source == "statement" or (source and existing.source != "statement"):
            existing.source = source
        return existing, False

    previous = (
        db.query(BankAccounts)
        .filter(
            BankAccounts.user_id == user_id,
            BankAccounts.account_number == account_number,
            BankAccounts.created_at < _day_start(day),
        )
        .order_by(BankAccounts.created_at.desc())
        .first()
    )

    opening_balance = previous.current_balance if previous is not None else Decimal("0")

    new_row = BankAccounts(
        id=row_id,
        user_id=user_id,
        bank_name=bank_name or (previous.bank_name if previous else None) or "Unknown",
        account_holder_name=(
            account_holder_name or (previous.account_holder_name if previous else None) or "Unknown"
        ),
        account_type=account_type or (previous.account_type if previous else None),
        account_number=account_number,
        current_balance=opening_balance,
        statement_balance=previous.statement_balance if previous else None,
        last_synced_at=previous.last_synced_at if previous else None,
        source=source or (previous.source if previous else None) or "email",
        created_at=_day_start(day),
    )
    db.add(new_row)
    db.flush()
    return new_row, True


def apply_transaction_to_ledger(
    db: Session,
    user_id: int,
    account_number: str,
    txn_type: str,
    amount: Decimal,
    txn_day: date,
    bank_name: Optional[str] = None,
    account_holder_name: Optional[str] = None,
    account_type: Optional[str] = None,
    stats: dict[str, int] | None = None,
) -> Decimal:
    """
    Apply one transaction's amount to the account's day-row and return the
    resulting balance. `txn_type` must already be normalized to "credit" or
    "debit". Used by the email flow only — statements carry their own
    authoritative balance and never go through this.
    """
    day_row, created = get_or_create_daily_balance(
        db,
        user_id=user_id,
        account_number=account_number,
        day=txn_day,
        bank_name=bank_name,
        account_holder_name=account_holder_name,
        account_type=account_type,
        source="email",
    )

    delta = amount if txn_type == "credit" else -amount
    day_row.current_balance = (day_row.current_balance or Decimal("0")) + delta
    day_row.updated_at = datetime.now(timezone.utc)

    db.flush()
    if stats is not None:
        key = "bank_accounts_inserted" if created else "bank_accounts_updated"
        stats[key] = stats.get(key, 0) + 1

    return day_row.current_balance


def set_daily_closing_balance(
    db: Session,
    user_id: int,
    account_number: str,
    day: date,
    closing_balance: Decimal,
    bank_name: Optional[str] = None,
    account_holder_name: Optional[str] = None,
    account_type: Optional[str] = None,
    stats: dict[str, int] | None = None,
) -> BankAccounts:
    """
    Overwrite the day-row's current_balance with a known-true closing balance
    (from a statement), rather than computing it incrementally.
    """
    day_row, created = get_or_create_daily_balance(
        db,
        user_id=user_id,
        account_number=account_number,
        day=day,
        bank_name=bank_name,
        account_holder_name=account_holder_name,
        account_type=account_type,
        source="statement",
    )
    day_row.current_balance = closing_balance
    day_row.statement_balance = closing_balance
    day_row.last_synced_at = _day_start(day)
    day_row.updated_at = datetime.now(timezone.utc)
    db.flush()
    if stats is not None:
        key = "bank_accounts_inserted" if created else "bank_accounts_updated"
        stats[key] = stats.get(key, 0) + 1

    return day_row


# ------------------------------------------------------------------ #
# Email flow — incremental balance, transaction dict returned in-place#
# ------------------------------------------------------------------ #


def _row_id(user_id: int, account_number: str, day: date) -> str:
    return f"{user_id}_{account_number}_{day.strftime('%Y%m%d')}"


def _row_day(row: BankAccounts) -> Optional[date]:
    return _as_day(row.created_at)


def _is_statement_anchor(row: BankAccounts) -> bool:
    row_day = _row_day(row)
    synced_day = _as_day(row.last_synced_at)

    return (
        row.statement_balance is not None
        and row_day is not None
        and (
            row.source == "statement"
            or synced_day == row_day
        )
    )


def _transaction_delta(transaction: Transactions) -> Optional[Decimal]:
    amount = _as_decimal(transaction.amount)
    txn_type = str(transaction.txn_type or "").strip().lower()

    if amount is None or txn_type not in VALID_LEDGER_TXN_TYPES:
        return None

    return amount if txn_type == "credit" else -amount


def _transaction_day(transaction: Transactions) -> Optional[date]:
    return _as_day(transaction.txn_date)


def _sort_datetime(value: Any) -> datetime:
    if not isinstance(value, datetime):
        return datetime.min.replace(tzinfo=timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _transaction_sort_key(transaction: Transactions) -> tuple:
    return (
        _sort_datetime(transaction.txn_date),
        _sort_datetime(transaction.created_at),
        transaction.id or "",
    )


def _account_meta_from_row(row: BankAccounts | None) -> dict[str, Any]:
    if row is None:
        return {}

    return {
        "bank_name": row.bank_name,
        "account_holder_name": row.account_holder_name,
        "account_type": row.account_type,
    }


def _account_meta_from_transaction(transaction: Transactions | None) -> dict[str, Any]:
    if transaction is None:
        return {}

    return {
        "bank_name": transaction.bank_name,
        "account_holder_name": transaction.account_holder_name,
        "account_type": transaction.account_type,
    }


def _fill_account_meta(row: BankAccounts, meta: dict[str, Any]) -> None:
    bank_name = meta.get("bank_name")
    account_holder_name = meta.get("account_holder_name")
    account_type = meta.get("account_type")

    if bank_name and (not row.bank_name or row.bank_name == "Unknown"):
        row.bank_name = bank_name
    if account_holder_name and (
        not row.account_holder_name
        or row.account_holder_name == "Unknown"
    ):
        row.account_holder_name = account_holder_name
    if account_type and not row.account_type:
        row.account_type = account_type


def _get_or_create_recalculation_row(
    db: Session,
    user_id: int,
    account_number: str,
    day: date,
    meta: dict[str, Any],
    source: str,
    stats: dict[str, int],
) -> BankAccounts:
    row_id = _row_id(user_id, account_number, day)
    row = (
        db.query(BankAccounts)
        .filter(
            BankAccounts.id == row_id,
            BankAccounts.user_id == user_id,
        )
        .first()
    )

    if row:
        _fill_account_meta(row, meta)
        stats["bank_accounts_updated"] = stats.get("bank_accounts_updated", 0) + 1
        return row

    row = BankAccounts(
        id=row_id,
        user_id=user_id,
        bank_name=meta.get("bank_name") or "Unknown",
        account_holder_name=meta.get("account_holder_name") or "Unknown",
        account_type=meta.get("account_type"),
        account_number=account_number,
        current_balance=Decimal("0"),
        statement_balance=None,
        last_synced_at=None,
        source=source,
        created_at=_day_start(day),
    )
    db.add(row)
    db.flush()
    stats["bank_accounts_inserted"] = stats.get("bank_accounts_inserted", 0) + 1
    return row


def recalculate_account_ledger(
    db: Session,
    user_id: int,
    account_number: str,
    stats: dict[str, int] | None = None,
) -> dict[str, int]:
    """
    Recompute all bank_accounts day rows for one account.

    Statement day rows are trusted anchors. Later rows carry the latest
    statement_balance/last_synced_at forward while current_balance is
    recalculated by applying non-statement transactions from the transactions
    table after that anchor.
    """
    account_number = str(account_number or "").strip()
    empty_result = {
        "accounts_recalculated": 0,
        "bank_accounts_inserted": 0,
        "bank_accounts_updated": 0,
    }
    if not account_number:
        return empty_result

    local_stats = stats if stats is not None else {}
    local_stats.setdefault("bank_accounts_inserted", 0)
    local_stats.setdefault("bank_accounts_updated", 0)

    existing_rows = (
        db.query(BankAccounts)
        .filter(
            BankAccounts.user_id == user_id,
            BankAccounts.account_number == account_number,
        )
        .order_by(BankAccounts.created_at.asc())
        .all()
    )
    rows_by_day = {
        row_day: row
        for row in existing_rows
        if (row_day := _row_day(row)) is not None
    }

    transactions = (
        db.query(Transactions)
        .filter(
            Transactions.user_id == user_id,
            Transactions.account_number == account_number,
            Transactions.txn_date.isnot(None),
            Transactions.amount.isnot(None),
            Transactions.is_flag.isnot(True),
        )
        .order_by(Transactions.txn_date.asc(), Transactions.created_at.asc(), Transactions.id.asc())
        .all()
    )

    transactions_by_day: dict[date, list[Transactions]] = {}
    transaction_meta_by_day: dict[date, dict[str, Any]] = {}
    for transaction in sorted(transactions, key=_transaction_sort_key):
        txn_day = _transaction_day(transaction)
        if txn_day is None:
            continue

        transactions_by_day.setdefault(txn_day, []).append(transaction)
        transaction_meta_by_day.setdefault(txn_day, _account_meta_from_transaction(transaction))

    anchor_rows = {
        day: row
        for day, row in rows_by_day.items()
        if _is_statement_anchor(row)
    }

    all_days = sorted(set(rows_by_day) | set(transactions_by_day) | set(anchor_rows))
    if not all_days:
        return empty_result

    fallback_meta = {}
    if existing_rows:
        fallback_meta.update(_account_meta_from_row(existing_rows[-1]))
    if transactions:
        fallback_meta.update({
            key: value
            for key, value in _account_meta_from_transaction(transactions[-1]).items()
            if value
        })

    running_balance = Decimal("0")
    statement_balance: Decimal | None = None
    statement_day: date | None = None
    touched_count = 0

    for day in all_days:
        anchor_row = anchor_rows.get(day)
        meta = (
            _account_meta_from_row(anchor_row)
            or transaction_meta_by_day.get(day)
            or fallback_meta
        )
        row_source = "statement" if anchor_row else "email"
        row = rows_by_day.get(day)
        if row:
            local_stats["bank_accounts_updated"] = local_stats.get("bank_accounts_updated", 0) + 1
        else:
            row = _get_or_create_recalculation_row(
                db,
                user_id=user_id,
                account_number=account_number,
                day=day,
                meta=meta,
                source=row_source,
                stats=local_stats,
            )
        _fill_account_meta(row, meta)

        if anchor_row:
            statement_balance = _as_decimal(anchor_row.statement_balance) or Decimal("0")
            statement_day = day
            running_balance = statement_balance
            row.source = "statement"
            row.current_balance = running_balance
            row.statement_balance = statement_balance
            row.last_synced_at = _day_start(statement_day)
        else:
            for transaction in transactions_by_day.get(day, []):
                if str(transaction.source or "").strip().lower() == "statement":
                    continue

                delta = _transaction_delta(transaction)
                if delta is not None:
                    running_balance += delta

            row.current_balance = running_balance
            if statement_balance is not None and statement_day is not None:
                row.statement_balance = statement_balance
                row.last_synced_at = _day_start(statement_day)
            else:
                row.statement_balance = None
                row.last_synced_at = None

            row.source = "email"

        row.updated_at = datetime.now(timezone.utc)
        db.add(row)
        touched_count += 1

    db.flush()

    print(
        "Ledger recalculated: "
        f"user={user_id} account={account_number} rows={touched_count} "
        f"bank_accounts_inserted={local_stats['bank_accounts_inserted']} "
        f"bank_accounts_updated={local_stats['bank_accounts_updated']}"
    )
    return {
        "accounts_recalculated": touched_count,
        "bank_accounts_inserted": local_stats["bank_accounts_inserted"],
        "bank_accounts_updated": local_stats["bank_accounts_updated"],
    }


def recalculate_ledgers_for_transactions(
    db: Session,
    transactions: List[Transactions],
    user_id: int,
    stats: dict[str, int] | None = None,
) -> dict[str, int]:
    account_numbers = {
        str(transaction.account_number or "").strip()
        for transaction in transactions or []
        if str(transaction.account_number or "").strip()
    }

    result = {
        "accounts_recalculated": 0,
        "bank_accounts_inserted": 0,
        "bank_accounts_updated": 0,
    }

    for account_number in sorted(account_numbers):
        before_inserted = (stats or {}).get("bank_accounts_inserted", 0)
        before_updated = (stats or {}).get("bank_accounts_updated", 0)
        account_result = recalculate_account_ledger(
            db,
            user_id=user_id,
            account_number=account_number,
            stats=stats,
        )
        result["accounts_recalculated"] += account_result.get("accounts_recalculated", 0)
        result["bank_accounts_inserted"] += (
            (stats or {}).get("bank_accounts_inserted", 0) - before_inserted
            if stats is not None
            else account_result.get("bank_accounts_inserted", 0)
        )
        result["bank_accounts_updated"] += (
            (stats or {}).get("bank_accounts_updated", 0) - before_updated
            if stats is not None
            else account_result.get("bank_accounts_updated", 0)
        )

    return result


def persist_transaction(
    db: Session,
    transaction: Dict[str, Any],
    user_id: int,
    stats: dict[str, int] | None = None,
) -> Optional[Dict[str, Any]]:
    """
    Process one extracted transaction: update the account's running balance
    in `bank_accounts` incrementally, and write the resulting balance back
    onto `transaction["balance_after_txn"]` (mutated in place).

    Does NOT write anything to the `transactions` table — the transaction
    dict itself (never a DB row) is returned so the caller can hand back a
    fully-calculated transaction without ever persisting it there.

    Returns None (and applies no ledger update) if:
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
            user_id=user_id,
            account_number=account_number,
            txn_type=txn_type_norm,
            amount=amount,
            txn_day=txn_day,
            bank_name=transaction.get("bank_name"),
            account_holder_name=transaction.get("account_holder_name"),
            account_type=transaction.get("account_type"),
            stats=stats,
        )

    if balance_after_txn is not None:
        transaction["balance_after_txn"] = float(balance_after_txn)

    # Only the bank_accounts changes above need committing.
    db.commit()

    return transaction


def persist_transactions_batch(
    db: Session,
    transactions: List[Dict[str, Any]],
    user_id: int,
) -> Dict[str, Any]:
    """
    Process a batch of extracted email transactions, updating bank_accounts
    only. One bad row never aborts the rest of the batch. Each transaction
    dict in `transactions` is mutated in place with its computed
    `balance_after_txn` where applicable.
    """
    persisted_refs: List[Any] = []
    skipped: List[Dict[str, Any]] = []
    stats: dict[str, int] = {
        "bank_accounts_inserted": 0,
        "bank_accounts_updated": 0,
    }

    for transaction in transactions:
        before_stats = dict(stats)
        try:
            result = persist_transaction(db, transaction, user_id, stats=stats)
        except Exception as exc:
            stats.update(before_stats)
            db.rollback()
            skipped.append({"reason": str(exc), "ref_number": transaction.get("ref_number")})
            continue

        if result is None:
            skipped.append({
                "reason": "not a parsed transaction, or amount could not be parsed",
                "ref_number": transaction.get("ref_number"),
            })
        else:
            persisted_refs.append(transaction.get("ref_number"))

    print(
        "Email ledger DB: "
        f"user={user_id} transactions_applied={len(persisted_refs)} "
        f"bank_accounts_inserted={stats['bank_accounts_inserted']} "
        f"bank_accounts_updated={stats['bank_accounts_updated']} "
        f"skipped={len(skipped)}"
    )

    return {
        "persisted_count": len(persisted_refs),
        "persisted_refs": persisted_refs,
        "skipped_count": len(skipped),
        "skipped": skipped,
        **stats,
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
    return (account_number, amount, txn_day)


def _find_matching_transaction(
    db: Session,
    user_id: int,
    transaction: Dict[str, Any],
    occurrence_counter: Dict[tuple, int],
) -> Optional[Transactions]:
    """
    Look for an existing transactions row (typically inserted earlier by some
    other process, e.g. an email alert pipeline) that this statement row
    corresponds to. This is a READ-ONLY lookup used purely to enrich the
    returned transaction dict — nothing is written back to this row.

    Primary key: ref_number.

    Fallback (no ref_number): account_number + amount + txn_date.
    Most statement rows have no ref_number at all, and a statement can
    legitimately contain multiple transactions that share the same amount on
    the same day — so instead of matching "any" row with that key, we match
    the Nth occurrence of that key in this batch to the Nth existing row with
    that key (both ordered by id). This is what keeps reprocessing the exact
    same statement idempotent (every row lines up with the same match every
    time) while still keeping genuinely-distinct same-amount/same-day
    transactions from colliding with each other.
    """
    account_number = transaction.get("account_number")
    if not account_number:
        return None

    ref_number = str(transaction.get("ref_number") or "").strip()
    if ref_number and ref_number != PLACEHOLDER_TEXT:
        match = (
            db.query(Transactions)
            .filter(
                Transactions.user_id == user_id,
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

    _, amount, txn_day = key
    query = db.query(Transactions).filter(
        Transactions.user_id == user_id,
        Transactions.account_number == account_number,
        Transactions.amount == amount,
        Transactions.txn_date == _day_start(txn_day),
    )

    candidates = query.order_by(Transactions.id).all()
    if occurrence_index < len(candidates):
        return candidates[occurrence_index]

    return None


def _fill_transaction_gaps_from_existing(transaction: Dict[str, Any], existing_row: Transactions) -> None:
    """
    Enrich the in-memory transaction dict with any fields it's missing,
    pulled from a previously-matched, already-recorded transaction row —
    never overwrites data the transaction dict already carries, and never
    writes anything back to `existing_row` / the DB.
    """
    for field in FILLABLE_FIELDS:
        if not _is_empty(transaction.get(field)):
            continue

        existing_value = getattr(existing_row, field, None)
        if not _is_empty(existing_value):
            transaction[field] = existing_value


def reconcile_statement_batch(
    db: Session,
    transactions: List[Dict[str, Any]],
    user_id: int,
) -> Dict[str, Any]:
    """
    Reconcile a batch of statement-extracted transactions (typically a full
    month, uploaded at month-end) against bank_accounts only:

      - Each transaction dict is matched (read-only) against whatever's
        already in `transactions` (by ref_number, falling back to
        account_number+amount+txn_date) and, on a match, filled in with any
        missing fields from that match — mutated in place, nothing written
        back to the DB and nothing inserted.
      - `transaction["balance_after_txn"]` is normalized from the
        statement's own value.

    Every (account, day) touched by the statement then has its
    bank_accounts.current_balance overwritten with that day's true closing
    balance, correcting any drift from earlier email-based estimates. The
    most recent day per account also updates statement_balance/last_synced_at.
    """
    def _sort_key(t: Dict[str, Any]):
        day = _as_day(t.get("txn_date")) or date.min
        return (t.get("account_number") or "", day, t.get("txn_time") or "")

    ordered = sorted(transactions, key=_sort_key)

    skipped: List[Dict[str, Any]] = []

    # (account_number, day) -> latest known true closing balance for that day
    day_closing_balance: Dict[tuple, Decimal] = {}
    # account_number -> {bank_name, account_holder_name, account_type}, so
    # brand-new bank_accounts day-rows created below aren't left as "Unknown"
    account_meta: Dict[str, Dict[str, Any]] = {}
    # (account, amount, day, time) -> how many times we've matched this key so far
    occurrence_counter: Dict[tuple, int] = {}
    stats: dict[str, int] = {
        "bank_accounts_inserted": 0,
        "bank_accounts_updated": 0,
    }
    recalculation_stats: dict[str, int] = {
        "bank_accounts_inserted": 0,
        "bank_accounts_updated": 0,
    }
    recalculated_account_rows = 0

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

        existing = _find_matching_transaction(db, user_id, transaction, occurrence_counter)
        if existing:
            _fill_transaction_gaps_from_existing(transaction, existing)

        if statement_balance is not None:
            transaction["balance_after_txn"] = float(statement_balance)
            day_closing_balance[(account_number, txn_day)] = statement_balance

    # Repair every day-row the statement actually covers (bank_accounts only).
    last_day_per_account: Dict[str, date] = {}
    for (account_number, day), closing_balance in day_closing_balance.items():
        meta = account_meta.get(account_number, {})
        set_daily_closing_balance(
            db,
            user_id=user_id,
            account_number=account_number,
            day=day,
            closing_balance=closing_balance,
            bank_name=meta.get("bank_name"),
            account_holder_name=meta.get("account_holder_name"),
            account_type=meta.get("account_type"),
            stats=stats,
        )
        if account_number not in last_day_per_account or day > last_day_per_account[account_number]:
            last_day_per_account[account_number] = day

    # Refresh statement_balance/last_synced_at using each account's most recent day in this statement.
    for account_number, day in last_day_per_account.items():
        closing_balance = day_closing_balance[(account_number, day)]
        row_id = f"{user_id}_{account_number}_{day.strftime('%Y%m%d')}"
        day_row = (
            db.query(BankAccounts)
            .filter(
                BankAccounts.id == row_id,
                BankAccounts.user_id == user_id,
            )
            .first()
        )
        if day_row:
            day_row.statement_balance = closing_balance
            day_row.last_synced_at = _day_start(day)
            db.add(day_row)

    for account_number in sorted({account for account, _day in day_closing_balance}):
        result = recalculate_account_ledger(
            db,
            user_id=user_id,
            account_number=account_number,
            stats=recalculation_stats,
        )
        recalculated_account_rows += result.get("accounts_recalculated", 0)

    db.commit()

    print(
        "Statement ledger DB: "
        f"user={user_id} bank_accounts_inserted={stats['bank_accounts_inserted']} "
        f"bank_accounts_updated={stats['bank_accounts_updated']} "
        f"recalculated_rows={recalculated_account_rows} "
        f"recalc_inserted={recalculation_stats['bank_accounts_inserted']} "
        f"recalc_updated={recalculation_stats['bank_accounts_updated']} "
        f"days_reconciled={len(day_closing_balance)} skipped={len(skipped)}"
    )

    return {
        "skipped_count": len(skipped),
        "skipped": skipped,
        **stats,
        "recalculated_account_rows": recalculated_account_rows,
        "recalculation_stats": recalculation_stats,
        "days_reconciled": [
            {"account_number": acc, "day": day.isoformat(), "closing_balance": float(bal)}
            for (acc, day), bal in day_closing_balance.items()
        ],
    }
