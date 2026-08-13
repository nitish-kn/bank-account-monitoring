from ....services.transaction_service import get_dashboard_summary, get_paginated_transactions
from ..schemas.chat_dto import ToolContext
from ..schemas.tool_params import MultiAccountAggregateParams, RecentTransactionsParams
from .base import tool


@tool(
    name="get_recent_transactions",
    description=(
        "Get the most recent transactions, optionally for a specific account/card (natural-language "
        "reference) and/or restricted to a tab: 'transactions' (bank transfers only), 'credit-card', "
        "or 'fastag'."
    ),
    params_model=RecentTransactionsParams,
    cache_tier="short",
)
def get_recent_transactions(
    ctx: ToolContext,
    account_or_card_identifier: str | None = None,
    limit: int = 10,
    tab: str | None = None,
) -> dict:
    filters: dict = {}
    if account_or_card_identifier:
        filters["account"] = account_or_card_identifier
    if tab:
        filters["tab"] = tab

    safe_limit = min(max(int(limit or 10), 1), 50)
    return get_paginated_transactions(
        ctx.db,
        ctx.user_id,
        filters,
        page=1,
        page_size=safe_limit,
        sort={"field": "date", "order": "desc"},
    )


@tool(
    name="multi_account_aggregate",
    description="Get combined transaction totals and a dashboard-style summary across several accounts at once, for a date range.",
    params_model=MultiAccountAggregateParams,
    cache_tier="medium",
)
def multi_account_aggregate(
    ctx: ToolContext,
    account_identifiers: list[str],
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    filters: dict = {"account": account_identifiers}
    if start_date or end_date:
        filters["dateRange"] = {"startDate": start_date, "endDate": end_date}
    return get_dashboard_summary(ctx.db, ctx.user_id, filters)
