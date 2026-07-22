from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, Date, cast, case, String, Float
from datetime import datetime, timedelta, time

from ..core.constants import (
    TRANSACTION_REVIEW_CONFIDENCE_THRESHOLD,
    TRANSACTION_REVIEW_REQUIRED_FIELDS,
    VALID_TRANSACTION_TYPES,
)
from ..models.transactions import Transactions
from ..utils.db_utils import transaction_to_schema_dict


VALID_TXN_TYPES_NORMALIZED = {
    str(txn_type).strip().lower() for txn_type in VALID_TRANSACTION_TYPES
}


def _lower_text(column):
    return func.lower(func.coalesce(cast(column, String), ""))


def _parse_date_bound(value, end_of_day: bool = False):
    if not value:
        return None

    if isinstance(value, datetime):
        if not end_of_day:
            return value
        return value.replace(hour=23, minute=59, second=59, microsecond=999999)

    try:
        parsed = datetime.strptime(str(value).strip()[:10], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None

    return datetime.combine(parsed, time.max if end_of_day else time.min)


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
        if compact_value:
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


def _missing_required_condition(field_name: str):
    column = getattr(Transactions, field_name)
    if field_name == "txn_date":
        return column.is_(None)
    return or_(column.is_(None), func.length(func.trim(cast(column, String))) == 0)


def _low_confidence_condition():
    confidence_text = Transactions.parser_metadata["confidence_score"].astext
    confidence_value = case(
        (
            confidence_text.op("~")(r"^[0-9]+(\.[0-9]+)?$"),
            cast(confidence_text, Float),
        ),
        else_=None,
    )
    return func.coalesce(
        confidence_value < TRANSACTION_REVIEW_CONFIDENCE_THRESHOLD,
        False,
    )


def _review_filter():
    txn_type = _lower_text(Transactions.txn_type)
    return or_(
        Transactions.is_flag.is_(True),
        txn_type.notin_(VALID_TXN_TYPES_NORMALIZED),
        *[
            _missing_required_condition(field_name)
            for field_name in TRANSACTION_REVIEW_REQUIRED_FIELDS
        ],
        _low_confidence_condition(),
    )


def apply_transaction_filters(query, filters: dict):
    if not filters:
        return query

    # Tab value (transactions, credit-card, fastag)
    tab_val = filters.get("tab")
    if tab_val == "credit-card":
        query = query.filter(
            or_(
                func.lower(Transactions.txn_via).like("%credit%"),
                func.lower(Transactions.txn_via).like("%card%"),
                func.lower(Transactions.mode).like("%credit%"),
                func.lower(Transactions.mode).like("%card%"),
                func.lower(Transactions.account_type).like("%credit%"),
                func.lower(Transactions.account_type).like("%card%")
            )
        )
    elif tab_val == "fastag":
        query = query.filter(
            or_(
                func.lower(Transactions.txn_via).like("%fastag%"),
                func.lower(Transactions.mode).like("%fastag%"),
                func.lower(Transactions.account_type).like("%fastag%")
            )
        )
    elif tab_val == "transactions":
        pass

    # Ensure user_id is already applied by the caller
    
    # Text Search (search)
    search_term = filters.get("search")
    if search_term:
        search_term = str(search_term).strip().lower()
        search_filter = f"%{search_term}%"
        # From frontend: subject, ref_number, counterparty, narration, category, bank_name, account_number, account_holder_name, account_type, txn_via
        query = query.filter(
            or_(
                _lower_text(Transactions.ref_number).like(search_filter),
                _lower_text(Transactions.counterparty).like(search_filter),
                _lower_text(Transactions.narration).like(search_filter),
                _lower_text(Transactions.category).like(search_filter),
                _lower_text(Transactions.bank_name).like(search_filter),
                _lower_text(Transactions.account_number).like(search_filter),
                _lower_text(Transactions.account_holder_name).like(search_filter),
                _lower_text(Transactions.account_type).like(search_filter),
                _lower_text(Transactions.txn_via).like(search_filter)
            )
        )
        
    # Date Range
    date_range = filters.get("dateRange") or {}
    start_date = _parse_date_bound(date_range.get("startDate"))
    end_date = _parse_date_bound(date_range.get("endDate"), end_of_day=True)
    if start_date:
        query = query.filter(Transactions.txn_date >= start_date)
    if end_date:
        query = query.filter(Transactions.txn_date <= end_date)
        
    # Select Filters (can be string or list)
    def _apply_list_filter(query, column, filter_val, contains=False, filter_kind=None):
        values = _active_filter_values(filter_val)
        if not values:
            return query

        column_value = _lower_text(column)
        normalized_values = [value.lower() for value in values]
        if contains:
            match_terms = []
            for value in normalized_values:
                match_terms.extend(_match_terms(value, filter_kind))

            return query.filter(
                or_(
                    *[
                        column_value.like(f"%{term}%")
                        for term in dict.fromkeys(match_terms)
                    ]
                )
            )

        if len(values) == 1:
            return query.filter(column_value == normalized_values[0])
        return query.filter(column_value.in_(normalized_values))

    query = _apply_list_filter(query, Transactions.bank_name, filters.get("bank"), contains=True, filter_kind="bank")
    query = _apply_list_filter(query, Transactions.account_number, filters.get("account"), contains=True, filter_kind="account")
    query = _apply_list_filter(query, Transactions.txn_type, filters.get("txnType"))
    query = _apply_list_filter(query, Transactions.mode, filters.get("mode"), contains=True)
    query = _apply_list_filter(query, Transactions.category, filters.get("category"), contains=True)
    query = _apply_list_filter(query, Transactions.currency, filters.get("currency"))
    query = _apply_list_filter(query, Transactions.account_holder_name, filters.get("accountHolderName"), contains=True)
    query = _apply_list_filter(query, Transactions.account_type, filters.get("accountType"), contains=True, filter_kind="account_type")
    
    # Status (parsed_status)
    status_val = filters.get("status")
    if status_val and status_val != "all":
        values = _active_filter_values(status_val)
        if values:
            if len(values) == 1:
                query = query.filter(Transactions.parser_metadata["parsed_status"].astext.ilike(values[0]))
            else:
                conditions = [Transactions.parser_metadata["parsed_status"].astext.ilike(v) for v in values]
                query = query.filter(or_(*conditions))

    # Amounts
    min_amt = filters.get("minAmount")
    max_amt = filters.get("maxAmount")
    if min_amt not in (None, ""):
        query = query.filter(Transactions.amount >= float(min_amt))
    if max_amt not in (None, ""):
        query = query.filter(Transactions.amount <= float(max_amt))

    # Entity (forwarded_by_name)
    entity_val = filters.get("entity")
    if entity_val and entity_val != "all":
        values = _active_filter_values(entity_val)
        if values:
            if len(values) == 1:
                query = query.filter(Transactions.email_metadata["forwarded_by_name"].astext.ilike(f"%{values[0]}%"))
            else:
                conditions = [Transactions.email_metadata["forwarded_by_name"].astext.ilike(f"%{v}%") for v in values]
                query = query.filter(or_(*conditions))
                
    # Individual Account (complex)
    ind_acc = filters.get("individualAccount")
    if ind_acc and ind_acc != "all":
        values = _active_filter_values(ind_acc)
        if values:
            conditions = []
            for val in values:
                parts = [p.strip() for p in val.split("-")]
                if len(parts) >= 3:
                    expected_holder, expected_bank, expected_account = parts[0], parts[1], parts[2]
                    bank_terms = _match_terms(expected_bank, "bank")
                    account_terms = _match_terms(expected_account, "account")
                    conditions.append(and_(
                        _lower_text(Transactions.account_holder_name).like(f"%{expected_holder.lower()}%"),
                        or_(
                            *[
                                _lower_text(Transactions.bank_name).like(f"%{bank_term}%")
                                for bank_term in bank_terms
                            ]
                        ),
                        or_(
                            *[
                                _lower_text(Transactions.account_number).like(f"%{account_term}%")
                                for account_term in account_terms
                            ]
                        )
                    ))
            if conditions:
                query = query.filter(or_(*conditions))

    return query


def build_base_query(
    db: Session,
    user_id: int,
    include_review: bool = False,
    only_review: bool = False,
):
    query = db.query(Transactions).filter(Transactions.user_id == user_id)
    review_filter = _review_filter()

    if only_review:
        return query.filter(review_filter)

    if not include_review:
        return query.filter(~review_filter)

    return query

SORTABLE_FIELDS = {
    "date": Transactions.txn_date,
    "txn_date": Transactions.txn_date,
    "amount": Transactions.amount,
    "bank": Transactions.bank_name,
    "bank_name": Transactions.bank_name,
    "counterparty": Transactions.counterparty,
    "category": Transactions.category,
    "type": Transactions.txn_type,
    "txn_type": Transactions.txn_type,
    "balance": Transactions.balance_after_txn,
    "balance_after_txn": Transactions.balance_after_txn,
    "narration": Transactions.narration,
    "source": Transactions.source,
}

def get_paginated_transactions(db: Session, user_id: int, filters: dict, page: int, page_size: int, sort: dict = None):
    query = build_base_query(db, user_id)
    query = apply_transaction_filters(query, filters)
    
    total_count = query.count()
    
    sort_field_key = sort.get("field") if sort else None
    sort_order = sort.get("order", "desc") if sort else "desc"
    
    if sort_field_key in SORTABLE_FIELDS:
        col = SORTABLE_FIELDS[sort_field_key]
        if sort_order == "asc":
            query = query.order_by(col.asc().nulls_last(), Transactions.id.asc())
        else:
            query = query.order_by(col.desc().nulls_last(), Transactions.id.asc())
    else:
        query = query.order_by(Transactions.txn_date.desc().nulls_last(), Transactions.id.asc())
        
    transactions = query.limit(page_size).offset((page - 1) * page_size).all()
    
    return {
        "data": [transaction_to_schema_dict(t) for t in transactions],
        "totalCount": total_count
    }

def get_dashboard_summary(db: Session, user_id: int, filters: dict):
    query = apply_transaction_filters(build_base_query(db, user_id), filters)
    review_query = apply_transaction_filters(
        build_base_query(db, user_id, only_review=True),
        filters,
    )
    
    # 1. Basic Stats
    stats = query.with_entities(
        func.count().label("totalTransactions"),
        func.sum(Transactions.amount).filter(func.lower(Transactions.txn_type) == "credit").label("totalCredit"),
        func.sum(Transactions.amount).filter(func.lower(Transactions.txn_type) == "debit").label("totalDebit"),
        func.count().filter(func.lower(Transactions.txn_type) == "credit").label("creditCount"),
        func.count().filter(func.lower(Transactions.txn_type) == "debit").label("debitCount"),
        func.max(Transactions.amount).filter(func.lower(Transactions.txn_type) == "credit").label("maxCreditAmount"),
        func.max(Transactions.amount).filter(func.lower(Transactions.txn_type) == "debit").label("maxDebitAmount"),
    ).first()
    
    total_credit = float(stats.totalCredit or 0)
    total_debit = float(stats.totalDebit or 0)
    net_balance = total_credit - total_debit
    
    # 2. Total Accounts
    total_accounts = query.with_entities(Transactions.bank_name).distinct().count()
    
    # 3. Top Credit Categories (top 5)
    credit_cats = query.filter(func.lower(Transactions.txn_type) == "credit").with_entities(
        Transactions.category,
        func.sum(Transactions.amount).label("total")
    ).group_by(Transactions.category).order_by(func.sum(Transactions.amount).desc()).limit(5).all()
    
    top_credit_categories = [{"category": c.category or "Uncategorized", "amount": float(c.total or 0)} for c in credit_cats]
    
    # 4. Top Debit Categories (top 5)
    debit_cats = query.filter(func.lower(Transactions.txn_type) == "debit").with_entities(
        Transactions.category,
        func.sum(Transactions.amount).label("total")
    ).group_by(Transactions.category).order_by(func.sum(Transactions.amount).desc()).limit(5).all()
    
    top_debit_categories = [{"category": c.category or "Uncategorized", "amount": float(c.total or 0)} for c in debit_cats]
    
    # 5. Top 5 Transactions (highest amount regardless of type)
    top_txns = (
        query.order_by(Transactions.amount.desc().nulls_last(), Transactions.id.asc())
        .limit(5)
        .all()
    )
    top_transactions = [transaction_to_schema_dict(t) for t in top_txns]
    
    # 6. Flagged Transactions
    flagged = review_query.order_by(Transactions.txn_date.desc().nulls_last()).limit(10).all()
    flagged_transactions = [transaction_to_schema_dict(t) for t in flagged]

    # 7. Daily Net Cash Flow Trend
    trend_rows = query.with_entities(
        cast(Transactions.txn_date, Date).label("date"),
        func.sum(
            case(
                (func.lower(Transactions.txn_type) == "credit", Transactions.amount),
                else_=-Transactions.amount
            )
        ).label("net")
    ).group_by(cast(Transactions.txn_date, Date)).order_by(cast(Transactions.txn_date, Date).asc()).all()

    date_range = (filters.get("dateRange") if filters else None) or {}
    start_str = date_range.get("startDate")
    end_str = date_range.get("endDate")
    
    start_date = None
    end_date = None
    if start_str:
        try:
            start_date = datetime.strptime(start_str, "%Y-%m-%d").date()
        except ValueError:
            pass
    if end_str:
        try:
            end_date = datetime.strptime(end_str, "%Y-%m-%d").date()
        except ValueError:
            pass
            
    if trend_rows:
        if not start_date:
            start_date = min(r.date for r in trend_rows if r.date)
        if not end_date:
            end_date = max(r.date for r in trend_rows if r.date)
            
    trend_map = {r.date: float(r.net or 0) for r in trend_rows if r.date}
    
    cash_flow_trend = []
    if start_date and end_date and start_date <= end_date:
        curr = start_date
        while curr <= end_date:
            net_amt = trend_map.get(curr, 0.0)
            cash_flow_trend.append({
                "date": curr.isoformat(),
                "label": curr.strftime("%d %b"),
                "netAmount": net_amt,
                "positiveAmount": net_amt if net_amt >= 0 else None,
                "negativeAmount": net_amt if net_amt < 0 else None
            })
            curr += timedelta(days=1)
    else:
        for r in trend_rows:
            if not r.date:
                continue
            net_amt = float(r.net or 0)
            cash_flow_trend.append({
                "date": r.date.isoformat(),
                "label": r.date.strftime("%d %b"),
                "netAmount": net_amt,
                "positiveAmount": net_amt if net_amt >= 0 else None,
                "negativeAmount": net_amt if net_amt < 0 else None
            })

    # 8. Transactions by Mode (Debit count)
    mode_rows = query.filter(func.lower(Transactions.txn_type) == "debit").with_entities(
        Transactions.mode,
        func.count().label("count")
    ).group_by(Transactions.mode).order_by(func.count().desc()).all()
    
    modes_data = []
    for r in mode_rows:
        modes_data.append({
            "name": r.mode or "Others",
            "value": r.count or 0
        })
        
    limit = 7
    if len(modes_data) > limit:
        top_modes = modes_data[:limit-1]
        others_count = sum(m["value"] for m in modes_data[limit-1:])
        top_modes.append({
            "name": "Others",
            "value": others_count
        })
        modes_data = top_modes
        
    total_mode_count = sum(m["value"] for m in modes_data)
    for idx, m in enumerate(modes_data):
        percent = (m["value"] / total_mode_count * 100) if total_mode_count else 0
        m["count"] = m["value"]
        m["percent"] = percent
        m["percentLabel"] = f"{percent:.1f}%"
        MODE_CHART_COLORS = [
            "#4f86f7",
            "#2f6fe4",
            "#22a6c7",
            "#f59e0b",
            "#1d9a57",
            "#6d4ee8",
            "#a3aab8",
        ]
        m["color"] = MODE_CHART_COLORS[idx % len(MODE_CHART_COLORS)]

    return {
        "totalCredit": total_credit,
        "totalDebit": total_debit,
        "netBalance": net_balance,
        "creditCount": stats.creditCount or 0,
        "debitCount": stats.debitCount or 0,
        "totalTransactions": stats.totalTransactions or 0,
        "maxCreditAmount": float(stats.maxCreditAmount or 0),
        "maxDebitAmount": float(stats.maxDebitAmount or 0),
        "totalAccounts": total_accounts,
        "topCreditCategories": top_credit_categories,
        "topDebitCategories": top_debit_categories,
        "topTransactions": top_transactions,
        "flaggedTransactions": flagged_transactions,
        "cashFlowTrend": cash_flow_trend,
        "transactionsByMode": modes_data
    }

def get_filter_options(db: Session, user_id: int):
    query = build_base_query(db, user_id)

    def _distinct_values(column):
        values = {
            str(row[0]).strip()
            for row in query.with_entities(column).distinct().all()
            if row[0] and str(row[0]).strip()
        }
        return sorted(values, key=str.lower)

    return {
        "entities": _distinct_values(Transactions.email_metadata["forwarded_by_name"].astext),
        "modes": _distinct_values(Transactions.mode),
        "categories": _distinct_values(Transactions.category),
        "currencies": _distinct_values(Transactions.currency),
        "statuses": ["parsed", "failed", "not_transaction"],
    }
