from ....services.accounts_service import get_account_balance_as_of, get_paginated_accounts
from ..schemas.chat_dto import ToolContext
from ..schemas.tool_params import AccountBalanceParams, AccountDeltaParams, ListAccountsParams
from .base import ToolError, tool


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
    account = get_account_balance_as_of(ctx.db, ctx.user_id, account_identifier, as_of_date)
    if not account:
        raise ToolError(f"No account found matching '{account_identifier}'.")
    return account


@tool(
    name="list_accounts",
    description="List all of the user's bank accounts, optionally filtered by bank name or account type.",
    params_model=ListAccountsParams,
    cache_tier="short",
)
def list_accounts(ctx: ToolContext, bank: str | None = None, account_type: str | None = None) -> dict:
    filters: dict = {}
    if bank:
        filters["bank"] = bank
    if account_type:
        filters["accountType"] = account_type
    return get_paginated_accounts(ctx.db, ctx.user_id, filters, page=1, page_size=100)


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
    account = get_account_balance_as_of(ctx.db, ctx.user_id, account_identifier)
    if not account:
        raise ToolError(f"No account found matching '{account_identifier}'.")
    return {
        "account_number": account["account_number"],
        "bank_name": account["bank_name"],
        "current_balance": account["current_balance"],
        "statement_balance": account["statement_balance"],
        "delta": account["delta"],
    }
