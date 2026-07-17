from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, Date, cast
from datetime import datetime, timezone, timedelta
from typing import Any

from ..models.transactions import Transactions
from ..utils.db_utils import transaction_to_schema_dict

def apply_transaction_filters(query, filters: dict):
    if not filters:
        return query

    # Ensure user_id is already applied by the caller
    
    # Text Search (search)
    search_term = filters.get("search")
    if search_term:
        search_term = search_term.lower()
        search_filter = f"%{search_term}%"
        # From frontend: subject, ref_number, counterparty, narration, category, bank_name, account_number, account_holder_name, account_type, txn_via
        query = query.filter(
            or_(
                func.lower(Transactions.ref_number).like(search_filter),
                func.lower(Transactions.counterparty).like(search_filter),
                func.lower(Transactions.narration).like(search_filter),
                func.lower(Transactions.category).like(search_filter),
                func.lower(Transactions.bank_name).like(search_filter),
                func.lower(Transactions.account_number).like(search_filter),
                func.lower(Transactions.account_holder_name).like(search_filter),
                func.lower(Transactions.account_type).like(search_filter),
                func.lower(Transactions.txn_via).like(search_filter)
            )
        )
        
    # Date Range
    date_range = filters.get("dateRange", {})
    start_date = date_range.get("startDate")
    end_date = date_range.get("endDate")
    if start_date:
        query = query.filter(Transactions.txn_date >= start_date)
    if end_date:
        # Include the entire end day
        query = query.filter(Transactions.txn_date <= f"{end_date} 23:59:59")
        
    # Select Filters (can be string or list)
    def _apply_list_filter(query, column, filter_val):
        if not filter_val or filter_val == "all":
            return query
        
        values = filter_val if isinstance(filter_val, list) else [filter_val]
        values = [v for v in values if v and v != "all"]
        
        if not values:
            return query
            
        if len(values) == 1:
            return query.filter(func.lower(column) == values[0].lower())
        else:
            return query.filter(func.lower(column).in_([v.lower() for v in values]))

    query = _apply_list_filter(query, Transactions.bank_name, filters.get("bank"))
    query = _apply_list_filter(query, Transactions.account_number, filters.get("account"))
    query = _apply_list_filter(query, Transactions.txn_type, filters.get("txnType"))
    query = _apply_list_filter(query, Transactions.mode, filters.get("mode"))
    query = _apply_list_filter(query, Transactions.category, filters.get("category"))
    query = _apply_list_filter(query, Transactions.currency, filters.get("currency"))
    query = _apply_list_filter(query, Transactions.account_holder_name, filters.get("accountHolderName"))
    query = _apply_list_filter(query, Transactions.account_type, filters.get("accountType"))
    
    # Status (parsed_status)
    status_val = filters.get("status")
    if status_val and status_val != "all":
        values = status_val if isinstance(status_val, list) else [status_val]
        values = [v for v in values if v and v != "all"]
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
        values = entity_val if isinstance(entity_val, list) else [entity_val]
        values = [v for v in values if v and v != "all"]
        if values:
            if len(values) == 1:
                query = query.filter(Transactions.email_metadata["forwarded_by_name"].astext.ilike(f"%{values[0]}%"))
            else:
                conditions = [Transactions.email_metadata["forwarded_by_name"].astext.ilike(f"%{v}%") for v in values]
                query = query.filter(or_(*conditions))
                
    # Individual Account (complex)
    ind_acc = filters.get("individualAccount")
    if ind_acc and ind_acc != "all":
        values = ind_acc if isinstance(ind_acc, list) else [ind_acc]
        values = [v for v in values if v and v != "all"]
        if values:
            conditions = []
            for val in values:
                parts = [p.strip() for p in val.split("-")]
                if len(parts) >= 3:
                    expected_holder, expected_bank, expected_account = parts[0], parts[1], parts[2]
                    conditions.append(and_(
                        func.lower(Transactions.account_holder_name).like(f"%{expected_holder.lower()}%"),
                        func.lower(Transactions.bank_name).like(f"%{expected_bank.lower()}%"),
                        func.lower(Transactions.account_number).like(f"%{expected_account.lower()}%")
                    ))
            if conditions:
                query = query.filter(or_(*conditions))

    return query


def build_base_query(db: Session, user_id: int):
    return db.query(Transactions).filter(Transactions.user_id == user_id)

def get_paginated_transactions(db: Session, user_id: int, filters: dict, page: int, page_size: int):
    query = build_base_query(db, user_id)
    query = apply_transaction_filters(query, filters)
    
    total_count = query.count()
    
    transactions = query.order_by(Transactions.txn_date.desc().nulls_last()).limit(page_size).offset((page - 1) * page_size).all()
    
    return {
        "data": [transaction_to_schema_dict(t) for t in transactions],
        "totalCount": total_count
    }

def get_dashboard_summary(db: Session, user_id: int, filters: dict):
    query = build_base_query(db, user_id)
    query = apply_transaction_filters(query, filters)
    
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
    
    top_credit_categories = [{"category": c.category or "Uncategorized", "total": float(c.total or 0)} for c in credit_cats]
    
    # 4. Top Debit Categories (top 5)
    debit_cats = query.filter(func.lower(Transactions.txn_type) == "debit").with_entities(
        Transactions.category,
        func.sum(Transactions.amount).label("total")
    ).group_by(Transactions.category).order_by(func.sum(Transactions.amount).desc()).limit(5).all()
    
    top_debit_categories = [{"category": c.category or "Uncategorized", "total": float(c.total or 0)} for c in debit_cats]
    
    # 5. Top 3 Transactions (highest amount regardless of type)
    top_txns = query.order_by(Transactions.amount.desc()).limit(3).all()
    top_transactions = [transaction_to_schema_dict(t) for t in top_txns]
    
    # 6. Flagged Transactions
    flagged = query.filter(Transactions.is_flag == True).order_by(Transactions.txn_date.desc().nulls_last()).limit(10).all()
    flagged_transactions = [transaction_to_schema_dict(t) for t in flagged]

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
        "flaggedTransactions": flagged_transactions
    }

def get_filter_options(db: Session, user_id: int):
    query = build_base_query(db, user_id)
    
    return {
        "banks": [row[0] for row in query.with_entities(Transactions.bank_name).distinct().all() if row[0]],
        "accounts": [row[0] for row in query.with_entities(Transactions.account_number).distinct().all() if row[0]],
        "modes": [row[0] for row in query.with_entities(Transactions.mode).distinct().all() if row[0]],
        "categories": [row[0] for row in query.with_entities(Transactions.category).distinct().all() if row[0]],
        "currencies": [row[0] for row in query.with_entities(Transactions.currency).distinct().all() if row[0]],
        "accountHolderNames": [row[0] for row in query.with_entities(Transactions.account_holder_name).distinct().all() if row[0]],
        "accountTypes": [row[0] for row in query.with_entities(Transactions.account_type).distinct().all() if row[0]],
        "statuses": ["parsed", "failed", "non_transaction"] # These are pretty static
    }
