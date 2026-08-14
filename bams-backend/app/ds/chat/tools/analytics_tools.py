from ....services.accounts_service import get_account_balance_as_of, get_paginated_accounts
from ....services.transaction_service import get_category_breakdown, get_dashboard_summary, get_via_breakdown
from ..schemas.chat_dto import ToolContext
from ..schemas.tool_params import (
    BalanceDropParams,
    CashFlowTrendParams,
    CategoryBreakdownParams,
    ComparePeriodsParams,
    DashboardSummaryParams,
    ViaBreakdownParams,
)
from .base import tool


def _date_range_filters(start_date: str | None, end_date: str | None, account: str | None = None) -> dict:
    filters: dict = {}
    if start_date or end_date:
        filters["dateRange"] = {"startDate": start_date, "endDate": end_date}
    if account:
        filters["account"] = account
    return filters


@tool(
    name="get_dashboard_summary",
    description=(
        "Get an overall spending/income dashboard summary for a date range: total credit/debit, "
        "net balance, top categories, top transactions, daily cash-flow trend, and spend by payment mode."
    ),
    params_model=DashboardSummaryParams,
    cache_tier="medium",
)
def get_dashboard_summary_tool(
    ctx: ToolContext,
    start_date: str | None = None,
    end_date: str | None = None,
    account: str | None = None,
) -> dict:
    return get_dashboard_summary(ctx.db, ctx.user_id, _date_range_filters(start_date, end_date, account))


@tool(
    name="get_cash_flow_trend",
    description="Get the daily net cash-flow trend (credits minus debits per day) for a date range, optionally for one account.",
    params_model=CashFlowTrendParams,
    cache_tier="medium",
)
def get_cash_flow_trend(ctx: ToolContext, start_date: str, end_date: str, account: str | None = None) -> dict:
    summary = get_dashboard_summary(ctx.db, ctx.user_id, _date_range_filters(start_date, end_date, account))
    return {"cashFlowTrend": summary.get("cashFlowTrend", [])}


@tool(
    name="get_category_breakdown",
    description=(
        "Get spend/income broken down by category (the full breakdown, not just the top 5) for a "
        "date range, optionally restricted to credits or debits only, and/or a specific tab "
        "(transactions/credit-card/fastag)."
    ),
    params_model=CategoryBreakdownParams,
    cache_tier="medium",
)
def get_category_breakdown_tool(
    ctx: ToolContext,
    start_date: str | None = None,
    end_date: str | None = None,
    txn_type: str | None = None,
    tab: str | None = None,
) -> dict:
    filters = _date_range_filters(start_date, end_date)
    if tab:
        filters["tab"] = tab
    return {"categories": get_category_breakdown(ctx.db, ctx.user_id, filters, txn_type)}


@tool(
    name="get_via_breakdown",
    description="Get totals split by transaction channel: bank transfer vs credit card vs FASTag, for a date range.",
    params_model=ViaBreakdownParams,
    cache_tier="medium",
)
def get_via_breakdown_tool(ctx: ToolContext, start_date: str | None = None, end_date: str | None = None) -> dict:
    return {"breakdown": get_via_breakdown(ctx.db, ctx.user_id, _date_range_filters(start_date, end_date))}


@tool(
    name="compare_periods",
    description="Compare dashboard summary totals (credit, debit, net balance) between two date ranges, optionally for one account.",
    params_model=ComparePeriodsParams,
    cache_tier="medium",
)
def compare_periods(
    ctx: ToolContext,
    period_a_start: str,
    period_a_end: str,
    period_b_start: str,
    period_b_end: str,
    account: str | None = None,
) -> dict:
    summary_a = get_dashboard_summary(ctx.db, ctx.user_id, _date_range_filters(period_a_start, period_a_end, account))
    summary_b = get_dashboard_summary(ctx.db, ctx.user_id, _date_range_filters(period_b_start, period_b_end, account))
    return {
        "period_a": {"start": period_a_start, "end": period_a_end, "summary": summary_a},
        "period_b": {"start": period_b_start, "end": period_b_end, "summary": summary_b},
        "delta": {
            "totalCredit": summary_b["totalCredit"] - summary_a["totalCredit"],
            "totalDebit": summary_b["totalDebit"] - summary_a["totalDebit"],
            "netBalance": summary_b["netBalance"] - summary_a["netBalance"],
        },
    }


@tool(
    name="find_biggest_balance_drop",
    description=(
        "Find which account(s) had the biggest balance drop (or rise) between two dates. Optionally "
        "restrict to a scope list of account identifiers; otherwise scans all of the user's accounts. "
        "Results are sorted with the biggest drop first."
    ),
    params_model=BalanceDropParams,
    cache_tier="medium",
)
def find_biggest_balance_drop(
    ctx: ToolContext,
    start_date: str,
    end_date: str,
    scope: list[str] | None = None,
) -> dict:
    if scope:
        identifiers = scope
    else:
        all_accounts = get_paginated_accounts(ctx.db, ctx.user_id, {}, page=1, page_size=100)
        identifiers = [a["account_number"] for a in all_accounts.get("accounts", []) if a.get("account_number")]

    results = []
    for identifier in identifiers:
        start_snapshot = get_account_balance_as_of(ctx.db, ctx.user_id, identifier, start_date)
        end_snapshot = get_account_balance_as_of(ctx.db, ctx.user_id, identifier, end_date)
        if not start_snapshot or not end_snapshot:
            continue

        try:
            start_balance = float(start_snapshot["current_balance"] or 0)
            end_balance = float(end_snapshot["current_balance"] or 0)
        except (TypeError, ValueError):
            continue

        results.append(
            {
                "account_number": end_snapshot["account_number"],
                "bank_name": end_snapshot["bank_name"],
                "account_holder_name": end_snapshot["account_holder_name"],
                "start_balance": start_balance,
                "end_balance": end_balance,
                "change": end_balance - start_balance,
            }
        )

    results.sort(key=lambda row: row["change"])
    return {"accounts": results}
