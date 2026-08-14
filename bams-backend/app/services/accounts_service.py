import uuid
from decimal import Decimal
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException

from sqlalchemy import String, cast, func, or_, and_
from sqlalchemy.orm import Session

from ..models.bank_accounts import BankAccounts
from ..models.transactions import Transactions
from ..utils.db_utils import transaction_to_schema_dict
from ..utils.sheets_utils import append_account_to_local_excel

import uuid

def _lower_text(column):
    return func.lower(func.coalesce(cast(column, String), ""))


def _active_filter_values(filter_val):
    if not filter_val or filter_val == "all":
        return []

    values = filter_val if isinstance(filter_val, list) else [filter_val]
    return [
        str(value).strip()
        for value in values
        if value and str(value).strip().lower() != "all"
    ]


def _compact_text(value: str) -> str:
    return "".join(ch for ch in str(value or "").lower() if ch.isalnum())


def _match_terms(value: str, filter_kind: str | None = None) -> list[str]:
    raw_value = str(value or "").strip().lower()
    if not raw_value:
        return []

    terms = [raw_value]
    compact_value = _compact_text(raw_value)

    if filter_kind == "bank":
        bank_key = (
            raw_value
            .replace("bank", "")
            .replace("limited", "")
            .replace("ltd", "")
            .strip()
        )
        if bank_key:
            terms.append(bank_key)

        for bank_term in ("axis", "icici", "hdfc", "indusind", "kotak"):
            if bank_term in compact_value:
                terms.append(bank_term)

    elif filter_kind == "account":
        digits = "".join(ch for ch in raw_value if ch.isdigit())
        if len(digits) >= 4:
            terms.append(digits[-4:])
        if compact_value:
            terms.append(compact_value)

    elif filter_kind == "account_type":
        for suffix in (" account", " a/c"):
            if raw_value.endswith(suffix):
                terms.append(raw_value[: -len(suffix)].strip())

    return list(dict.fromkeys(term for term in terms if term))


def _parse_date(value):
    if not value:
        return None

    if isinstance(value, datetime):
        return value.date()

    try:
        return datetime.strptime(str(value).strip()[:10], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def _selected_account_date(filters: dict | None):
    if not filters:
        return date.today()

    return (
        _parse_date(
            filters.get("date")
            or filters.get("selectedDate")
            or filters.get("asOfDate")
        )
        or date.today()
    )


def _day_bounds(selected_date: date) -> tuple[datetime, datetime]:
    day_start = datetime.combine(
        selected_date,
        datetime.min.time(),
        tzinfo=timezone.utc,
    )
    return day_start, day_start + timedelta(days=1)


def _apply_list_filter(query, column, filter_val, filter_kind: str | None = None):
    values = _active_filter_values(filter_val)
    if not values:
        return query

    column_value = _lower_text(column)
    match_terms = []
    for value in values:
        match_terms.extend(_match_terms(value, filter_kind))

    conditions = [
        column_value.like(f"%{term}%")
        for term in dict.fromkeys(match_terms)
    ]

    if not conditions:
        return query

    return query.filter(or_(*conditions))


def _apply_category_filter(query, filter_val):
    values = _active_filter_values(filter_val)
    if not values:
        return query

    column_value = _lower_text(BankAccounts.category)
    conditions = []

    for value in values:
        match_terms = _match_terms(value)
        conditions.extend([
            column_value.like(f"%{term}%")
            for term in match_terms
        ])

        if _compact_text(value) in {"other", "others"}:
            conditions.extend([
                BankAccounts.category.is_(None),
                BankAccounts.category == "",
            ])

    if not conditions:
        return query

    return query.filter(or_(*conditions))


def _decimal_to_string(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return str(value)
    return str(value)


def _datetime_to_iso(value) -> str | None:
    return value.isoformat() if value else None


def account_to_dict(account: BankAccounts) -> dict:
    current_balance = account.current_balance
    statement_balance = account.statement_balance
    delta = None

    if current_balance is not None or statement_balance is not None:
        delta = (current_balance or Decimal("0")) - (statement_balance or Decimal("0"))

    statement_updated_at = account.last_synced_at or 0
    calculated_updated_at = account.created_at or 0

    return {
        "id": account.id,
        "bank_name": account.bank_name,
        "account_holder_name": account.account_holder_name,
        "account_type": account.account_type,
        "account_number": account.account_number,
        "category": account.category,
        "current_balance": _decimal_to_string(current_balance),
        "calculated_balance": _decimal_to_string(current_balance),
        "statement_balance": _decimal_to_string(statement_balance),
        "delta": _decimal_to_string(delta),
        "source": account.source,
        "statement_updated_at": _datetime_to_iso(statement_updated_at),
        "calculated_updated_at": _datetime_to_iso(calculated_updated_at),
        "last_calculated_at": _datetime_to_iso(calculated_updated_at),
        "last_updated": _datetime_to_iso(calculated_updated_at),
        "created_at": _datetime_to_iso(account.created_at),
        "updated_at": _datetime_to_iso(account.updated_at),
    }


def _account_identity_key(account: BankAccounts) -> tuple[str, str, str]:
    return (
        _compact_text(account.account_number),
        _compact_text(account.bank_name),
        _compact_text(account.account_holder_name),
    )


def _datetime_rank(value) -> float:
    if not value:
        return 0

    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.timestamp()

    return 0


def _account_as_of_rank(account: BankAccounts) -> tuple[float, float, float, str]:
    return (
        _datetime_rank(account.created_at),
        _datetime_rank(account.last_synced_at),
        _datetime_rank(account.updated_at),
        str(account.id or ""),
    )


def _latest_account_rows_as_of(accounts: list[BankAccounts]) -> list[BankAccounts]:
    latest_by_identity: dict[tuple[str, str, str], BankAccounts] = {}

    for account in accounts:
        identity_key = _account_identity_key(account)
        current_latest = latest_by_identity.get(identity_key)
        if current_latest and _account_as_of_rank(current_latest) >= _account_as_of_rank(account):
            continue

        latest_by_identity[identity_key] = account

    return list(latest_by_identity.values())


def _account_delta(account: BankAccounts) -> Decimal | None:
    if account.current_balance is None and account.statement_balance is None:
        return None
    return (account.current_balance or Decimal("0")) - (account.statement_balance or Decimal("0"))


def _account_last_updated(account: BankAccounts):
    return account.last_synced_at or account.updated_at or account.created_at


def _account_sort_value(account: BankAccounts, sort_field_key: str | None):
    sort_values = {
        "account": account.account_holder_name,
        "account_holder_name": account.account_holder_name,
        "account_number": account.account_number,
        "type": account.account_type,
        "account_type": account.account_type,
        "category": account.category,
        "bank": account.bank_name,
        "bank_name": account.bank_name,
        "statement_balance": account.statement_balance,
        "current_balance": account.current_balance,
        "calculated_balance": account.current_balance,
        "delta": _account_delta(account),
        "last_updated": _account_last_updated(account),
    }

    return sort_values.get(sort_field_key or "account", account.account_holder_name)


def _normalize_sort_value(value):
    if isinstance(value, str):
        return value.lower()
    if isinstance(value, datetime):
        return _datetime_rank(value)
    if isinstance(value, Decimal):
        return value
    return value


def _sort_account_rows(
    accounts: list[BankAccounts],
    sort: dict | None,
) -> list[BankAccounts]:
    sort_field_key = sort.get("field") if sort else "account"
    sort_order = sort.get("order", "asc") if sort else "asc"
    descending = sort_order == "desc"

    present_accounts = []
    missing_accounts = []

    for account in accounts:
        sort_value = _account_sort_value(account, sort_field_key)
        if sort_value in (None, ""):
            missing_accounts.append(account)
        else:
            present_accounts.append(account)

    present_accounts.sort(
        key=lambda account: (
            _normalize_sort_value(_account_sort_value(account, sort_field_key)),
            str(account.id or ""),
        ),
        reverse=descending,
    )
    missing_accounts.sort(key=lambda account: str(account.id or ""))

    return [*present_accounts, *missing_accounts]


def apply_account_filters(query, filters: dict | None):
    if not filters:
        return query

    search_term = str(filters.get("search") or "").strip().lower()
    if search_term:
        search_filter = f"%{search_term}%"
        query = query.filter(
            or_(
                _lower_text(BankAccounts.account_holder_name).like(search_filter),
                _lower_text(BankAccounts.account_number).like(search_filter),
                _lower_text(BankAccounts.bank_name).like(search_filter),
                _lower_text(BankAccounts.account_type).like(search_filter),
                _lower_text(BankAccounts.category).like(search_filter),
                _lower_text(BankAccounts.source).like(search_filter),
            )
        )

    account_holder_filter = (
        filters.get("accountHolderName")
        or filters.get("account_holder_name")
        or filters.get("accountHolder")
        or filters.get("account_holder")
    )

    query = _apply_list_filter(
        query,
        BankAccounts.account_number,
        filters.get("account"),
        filter_kind="account",
    )
    query = _apply_list_filter(
        query,
        BankAccounts.bank_name,
        filters.get("bank"),
        filter_kind="bank",
    )
    query = _apply_list_filter(
        query,
        BankAccounts.account_type,
        filters.get("accountType") or filters.get("account_type"),
        filter_kind="account_type",
    )
    query = _apply_category_filter(query, filters.get("category"))
    query = _apply_list_filter(
        query,
        BankAccounts.account_holder_name,
        account_holder_filter,
    )

    individual_accounts = _active_filter_values(filters.get("individualAccount"))
    if individual_accounts:
        conditions = []
        for value in individual_accounts:
            parts = [part.strip() for part in value.split("-")]
            if len(parts) < 3:
                continue

            expected_holder, expected_bank, expected_account = parts[0], parts[1], parts[2]
            bank_terms = _match_terms(expected_bank, "bank")
            account_terms = _match_terms(expected_account, "account")

            if not bank_terms or not account_terms:
                continue

            conditions.append(and_(
                _lower_text(BankAccounts.account_holder_name).like(
                    f"%{expected_holder.lower()}%"
                ),
                or_(
                    *[
                        _lower_text(BankAccounts.bank_name).like(f"%{bank_term}%")
                        for bank_term in bank_terms
                    ]
                ),
                or_(
                    *[
                        _lower_text(BankAccounts.account_number).like(f"%{account_term}%")
                        for account_term in account_terms
                    ]
                ),
            ))

        if conditions:
            query = query.filter(or_(*conditions))

    return query


def get_paginated_accounts(
    db: Session,
    user_id: int,
    filters: dict | None,
    page: int,
    page_size: int,
    sort: dict | None = None,
) -> dict:
    safe_page = max(int(page or 1), 1)
    safe_page_size = min(max(int(page_size or 10), 1), 1000)

    selected_date = _selected_account_date(filters)
    _, day_end = _day_bounds(selected_date)

    query = db.query(BankAccounts).filter(
        BankAccounts.user_id == user_id,
        BankAccounts.created_at < day_end,
    )
    query = apply_account_filters(query, filters)

    latest_accounts = _latest_account_rows_as_of(query.all())
    sorted_accounts = _sort_account_rows(latest_accounts, sort)
    total_count = len(sorted_accounts)
    start_index = (safe_page - 1) * safe_page_size
    accounts = sorted_accounts[start_index:start_index + safe_page_size]

    return {
        "accounts": [account_to_dict(account) for account in accounts],
        "totalCount": total_count,
    }


def get_recent_account_transactions(
    db: Session,
    user_id: int,
    account_id: str,
    limit: int = 5,
) -> dict:
    safe_limit = min(max(int(limit or 5), 1), 10)

    account = (
        db.query(BankAccounts)
        .filter(
            BankAccounts.user_id == user_id,
            BankAccounts.id == account_id,
        )
        .first()
    )

    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")

    account_digits = "".join(ch for ch in str(account.account_number or "") if ch.isdigit())
    account_filters = [Transactions.account_number == account.account_number]

    if len(account_digits) >= 4:
        account_filters.append(
            _lower_text(Transactions.account_number).like(f"%{account_digits[-4:]}%")
        )

    query = db.query(Transactions).filter(
        Transactions.user_id == user_id,
        or_(*account_filters),
    )

    if account.bank_name:
        bank_terms = _match_terms(account.bank_name, "bank")
        if bank_terms:
            query = query.filter(or_(*[
                _lower_text(Transactions.bank_name).like(f"%{term}%")
                for term in bank_terms
            ]))

    if account.account_holder_name:
        query = query.filter(
            _lower_text(Transactions.account_holder_name).like(
                f"%{account.account_holder_name.lower()}%"
            )
        )

    transactions = (
        query
        .order_by(
            Transactions.txn_date.desc().nulls_last(),
            Transactions.created_at.desc().nulls_last(),
            Transactions.id.desc(),
        )
        .limit(safe_limit)
        .all()
    )

    return {
        "transactions": [transaction_to_schema_dict(transaction) for transaction in transactions],
        "totalCount": len(transactions),
        "limit": safe_limit,
    }


def create_new_account(db: Session, request: dict, user_id: int) -> None:
    """Create a new bank account for a user"""

    bank_name = request.bank
    account_no = request.accountno
    account_type = request.type
    account_holder_name = request.name

    if not (bank_name and account_no and account_type and account_holder_name):
        raise HTTPException(
            status_code=400,
            detail="Important fields are missing."
        )
    
    # Check for existing account number
    existing_account = (db.query(BankAccounts)
    .filter(
        BankAccounts.account_number == account_no,
        BankAccounts.user_id == user_id
    ).first())
    
    if existing_account:
        raise HTTPException(status_code=400, detail="Account number already exists.")
    
    try:
        new_account = BankAccounts(
            id=str(uuid.uuid4()),
            bank_name= bank_name,
            account_number = account_no,
            account_type = account_type,
            account_holder_name = account_holder_name,
            source = "manual",
            user_id = user_id
        )

        db.add(new_account)

        # Append to local Excel sheet
        excel_success = append_account_to_local_excel(
            bank_name=bank_name,
            name=account_holder_name,
            ac_type=account_type,
            account_no=account_no
        )
        if not excel_success:
            raise Exception("Failed to write to Excel sheet")

        db.commit()
        db.refresh(new_account)

        return {
            "status" : 201,
            "message": f'New account with account number - {account_no}, is created successfully'
        }

    except Exception as e:
        db.rollback()
        print(f"Error creating new account: {e}")
        raise HTTPException(status_code=500, detail="Internal server error occurred while creating the account.")
