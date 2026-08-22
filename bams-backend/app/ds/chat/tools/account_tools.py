from decimal import Decimal, InvalidOperation

from ....services.accounts_service import get_account_balance_as_of, get_paginated_accounts
from ...llm.utils.account_lookup import list_all_accounts_from_excel, load_bank_accounts_data
from ..schemas.chat_dto import ToolContext
from ..schemas.tool_params import AccountBalanceParams, AccountDeltaParams, ListAccountsParams
from .base import ToolError, tool


def _digits(text) -> str:
    return "".join(ch for ch in str(text or "") if ch.isdigit())


def _to_decimal(value):
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


@tool(
    name="get_account_balance",
    description=(
        "Get the current balance, statement balance, and delta for a specific bank account, "
        "identified by a natural-language reference (bank name, last-4 digits, account holder "
        "name, etc). Optionally as of a specific past date instead of today."
    ),
    params_model=AccountBalanceParams,
    cache_tier="short",
)
def get_account_balance(ctx: ToolContext, account_identifier: str, as_of_date: str | None = None) -> dict:
    account = get_account_balance_as_of(ctx.db, ctx.org_id, account_identifier, as_of_date)
    if not account:
        raise ToolError(f"No account found matching '{account_identifier}'.")
    return account


@tool(
    name="list_accounts",
    description=(
        "List every bank account on file -- including accounts with no transaction history yet "
        "(sourced from the reference sheet, not just the database, since a database row only "
        "exists once a transaction or statement has actually touched that account) -- sorted by "
        "bank then account holder name. Includes pre-computed aggregates: total_current_balance, "
        "total_statement_balance, and accounts_by_bank (bank name -> account count). Use these "
        "fields directly for 'total balance across accounts' / 'which bank has the most accounts' "
        "questions -- never sum or count the account list yourself."
    ),
    params_model=ListAccountsParams,
    cache_tier="short",
)
def list_accounts(ctx: ToolContext, bank: str | None = None, account_type: str | None = None) -> dict:
    filters: dict = {}
    if bank:
        filters["bank"] = bank
    if account_type:
        filters["accountType"] = account_type

    db_result = get_paginated_accounts(ctx.db, ctx.org_id, filters, page=1, page_size=500)
    db_accounts = db_result.get("accounts", [])
    known_last4 = {
        digits[-4:]
        for account in db_accounts
        if (digits := _digits(account.get("account_number")))
    }

    # A bank_accounts row only exists once a transaction/statement has touched that
    # account -- an account sitting on the reference sheet with no activity yet is
    # otherwise invisible here, so merge it in (without balance data, which the
    # sheet doesn't carry) rather than silently under-reporting the account list.
    excel_only: list[dict] = []
    try:
        excel_df = load_bank_accounts_data()
        for row in list_all_accounts_from_excel(excel_df):
            last4 = _digits(row.get("account_number"))[-4:]
            if last4 and last4 in known_last4:
                continue

            row_bank = str(row.get("bank_name") or "")
            row_type = str(row.get("account_type") or "")
            if bank and bank.strip().lower() not in row_bank.lower():
                continue
            if account_type and account_type.strip().lower() not in row_type.lower():
                continue

            excel_only.append({
                **row,
                "current_balance": None,
                "statement_balance": None,
                "balance_data": "not available -- no transaction history yet",
            })
            if last4:
                known_last4.add(last4)
    except Exception:
        pass

    all_accounts = [*db_accounts, *excel_only]
    all_accounts.sort(key=lambda a: (str(a.get("bank_name") or ""), str(a.get("account_holder_name") or "")))

    total_current_balance = Decimal("0")
    total_statement_balance = Decimal("0")
    accounts_by_bank: dict[str, int] = {}

    for account in all_accounts:
        bank_name = str(account.get("bank_name") or "Unknown")
        accounts_by_bank[bank_name] = accounts_by_bank.get(bank_name, 0) + 1

        current = _to_decimal(account.get("current_balance"))
        if current is not None:
            total_current_balance += current

        statement = _to_decimal(account.get("statement_balance"))
        if statement is not None:
            total_statement_balance += statement

    return {
        "accounts": all_accounts,
        "totalCount": len(all_accounts),
        "accounts_with_balance_data": len(db_accounts),
        "accounts_reference_only_no_activity_yet": len(excel_only),
        "total_current_balance": str(total_current_balance),
        "total_statement_balance": str(total_statement_balance),
        "accounts_by_bank": accounts_by_bank,
    }


@tool(
    name="get_account_delta",
    description=(
        "Get the delta (current_balance - statement_balance) for a specific account -- how much "
        "the live balance has drifted from the last confirmed bank statement."
    ),
    params_model=AccountDeltaParams,
    cache_tier="short",
)
def get_account_delta(ctx: ToolContext, account_identifier: str) -> dict:
    account = get_account_balance_as_of(ctx.db, ctx.org_id, account_identifier)
    if not account:
        raise ToolError(f"No account found matching '{account_identifier}'.")
    return {
        "account_number": account["account_number"],
        "bank_name": account["bank_name"],
        "current_balance": account["current_balance"],
        "statement_balance": account["statement_balance"],
        "delta": account["delta"],
    }
