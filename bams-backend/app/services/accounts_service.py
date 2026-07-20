from decimal import Decimal
from datetime import datetime

from sqlalchemy import Date, String, cast, func, or_, and_
from sqlalchemy.orm import Session

from ..models.bank_accounts import BankAccounts


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


def _balance_delta_expr():
    return (
        func.coalesce(BankAccounts.current_balance, 0)
        - func.coalesce(BankAccounts.statement_balance, 0)
    )


def _last_updated_expr():
    return func.coalesce(
        BankAccounts.last_synced_at,
        BankAccounts.updated_at,
        BankAccounts.created_at,
    )


SORTABLE_FIELDS = {
    "account": BankAccounts.account_holder_name,
    "account_holder_name": BankAccounts.account_holder_name,
    "account_number": BankAccounts.account_number,
    "type": BankAccounts.account_type,
    "account_type": BankAccounts.account_type,
    "bank": BankAccounts.bank_name,
    "bank_name": BankAccounts.bank_name,
    "statement_balance": BankAccounts.statement_balance,
    "current_balance": BankAccounts.current_balance,
    "calculated_balance": BankAccounts.current_balance,
    "delta": _balance_delta_expr(),
    "last_updated": _last_updated_expr(),
}


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

    statement_updated_at = account.updated_at or account.created_at
    calculated_updated_at = account.last_synced_at or account.updated_at or account.created_at

    return {
        "id": account.id,
        "bank_name": account.bank_name,
        "account_holder_name": account.account_holder_name,
        "account_type": account.account_type,
        "account_number": account.account_number,
        "current_balance": _decimal_to_string(current_balance),
        "calculated_balance": _decimal_to_string(current_balance),
        "statement_balance": _decimal_to_string(statement_balance),
        "delta": _decimal_to_string(delta),
        "source": account.source,
        "statement_updated_at": _datetime_to_iso(statement_updated_at),
        "calculated_updated_at": _datetime_to_iso(calculated_updated_at),
        "last_updated": _datetime_to_iso(calculated_updated_at),
        "created_at": _datetime_to_iso(account.created_at),
        "updated_at": _datetime_to_iso(account.updated_at),
    }


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

    selected_date = _parse_date(
        filters.get("date")
        or filters.get("selectedDate")
        or filters.get("asOfDate")
    )
    if selected_date:
        query = query.filter(
            or_(
                cast(BankAccounts.last_synced_at, Date) == selected_date,
                cast(BankAccounts.updated_at, Date) == selected_date,
                cast(BankAccounts.created_at, Date) == selected_date,
            )
        )

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

    query = db.query(BankAccounts).filter(BankAccounts.user_id == user_id)
    query = apply_account_filters(query, filters)

    total_count = query.count()
    sort_field_key = sort.get("field") if sort else None
    sort_order = sort.get("order", "asc") if sort else "asc"
    sort_column = SORTABLE_FIELDS.get(sort_field_key, BankAccounts.account_holder_name)

    if sort_order == "desc":
        query = query.order_by(sort_column.desc().nulls_last(), BankAccounts.id.asc())
    else:
        query = query.order_by(sort_column.asc().nulls_last(), BankAccounts.id.asc())

    accounts = (
        query
        .limit(safe_page_size)
        .offset((safe_page - 1) * safe_page_size)
        .all()
    )

    return {
        "accounts": [account_to_dict(account) for account in accounts],
        "totalCount": total_count,
    }
