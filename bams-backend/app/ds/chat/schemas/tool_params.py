from typing import Literal, Optional

from pydantic import BaseModel, Field


class AccountBalanceParams(BaseModel):
    account_identifier: str = Field(
        ..., description="Natural-language reference to the account: bank name, last-4 digits of "
        "the account number, account holder name, etc."
    )
    as_of_date: Optional[str] = Field(
        None, description="Date (YYYY-MM-DD) to get the balance as of. Omit for the latest/current balance."
    )


class ListAccountsParams(BaseModel):
    bank: Optional[str] = Field(None, description="Filter to accounts at this bank.")
    account_type: Optional[str] = Field(None, description="Filter to accounts of this type, e.g. Savings, Current.")


class AccountDeltaParams(BaseModel):
    account_identifier: str = Field(..., description="Natural-language reference to the account.")


class RecentTransactionsParams(BaseModel):
    account_or_card_identifier: Optional[str] = Field(
        None, description="Natural-language reference to an account or card. Omit to include all accounts/cards."
    )
    limit: int = Field(10, description="Number of transactions to return (max 50).")
    tab: Optional[Literal["transactions", "credit-card", "fastag"]] = Field(
        None, description="Restrict to bank transfers ('transactions'), credit card, or FASTag transactions."
    )


class DashboardSummaryParams(BaseModel):
    start_date: Optional[str] = Field(None, description="Start date (YYYY-MM-DD) of the range.")
    end_date: Optional[str] = Field(None, description="End date (YYYY-MM-DD) of the range.")
    account: Optional[str] = Field(None, description="Restrict to a single account/card, natural-language reference.")


class CashFlowTrendParams(BaseModel):
    start_date: str = Field(..., description="Start date (YYYY-MM-DD).")
    end_date: str = Field(..., description="End date (YYYY-MM-DD).")
    account: Optional[str] = Field(None, description="Restrict to a single account/card.")


class CategoryBreakdownParams(BaseModel):
    start_date: Optional[str] = Field(None, description="Start date (YYYY-MM-DD) of the range.")
    end_date: Optional[str] = Field(None, description="End date (YYYY-MM-DD) of the range.")
    txn_type: Optional[Literal["credit", "debit"]] = Field(None, description="Restrict to credits or debits only.")
    tab: Optional[Literal["transactions", "credit-card", "fastag"]] = Field(None, description="Restrict to a specific transaction channel.")


class ViaBreakdownParams(BaseModel):
    start_date: Optional[str] = Field(None, description="Start date (YYYY-MM-DD) of the range.")
    end_date: Optional[str] = Field(None, description="End date (YYYY-MM-DD) of the range.")


class MultiAccountAggregateParams(BaseModel):
    account_identifiers: list[str] = Field(
        ..., description="List of natural-language account/card references to aggregate together."
    )
    start_date: Optional[str] = Field(None, description="Start date (YYYY-MM-DD) of the range.")
    end_date: Optional[str] = Field(None, description="End date (YYYY-MM-DD) of the range.")


class ComparePeriodsParams(BaseModel):
    period_a_start: str = Field(..., description="Start date (YYYY-MM-DD) of the first period.")
    period_a_end: str = Field(..., description="End date (YYYY-MM-DD) of the first period.")
    period_b_start: str = Field(..., description="Start date (YYYY-MM-DD) of the second period.")
    period_b_end: str = Field(..., description="End date (YYYY-MM-DD) of the second period.")
    account: Optional[str] = Field(None, description="Restrict the comparison to a single account/card.")


class BalanceDropParams(BaseModel):
    start_date: str = Field(..., description="Start date (YYYY-MM-DD) of the window.")
    end_date: str = Field(..., description="End date (YYYY-MM-DD) of the window.")
    scope: Optional[list[str]] = Field(
        None, description="Optional list of natural-language account identifiers to restrict the scan to. "
        "Omit to scan all of the user's accounts."
    )


class ListCreditCardsParams(BaseModel):
    issuer: Optional[str] = Field(None, description="Filter to cards from this issuer/bank, e.g. 'HDFC'.")


class ResolveAccountParams(BaseModel):
    query_text: str = Field(
        ..., description="The vague account/card reference from the user's message, e.g. 'my HDFC card' "
        "or 'axis salary account'."
    )
