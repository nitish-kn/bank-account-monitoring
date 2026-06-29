"""
models.py — Pydantic models for bank statement transaction extraction.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


# ------------------------------------------------------------------ #
# ParserMetadata                                                      #
# ------------------------------------------------------------------ #

class ParserMetadata(BaseModel):
    parser_version: Optional[str] = None
    extracted_at: Optional[str] = None
    batch_index: Optional[int] = None
    page_number: Optional[int] = Field(
        default=None,
        description="1-based page number this row came from.",
    )
    confidence: Optional[str] = Field(
        default=None,
        description="Model confidence hint: 'high', 'medium', or 'low'.",
    )
    extraction_notes: Optional[str] = Field(
        default=None,
        description="Any caveats about image quality or partial visibility.",
    )


# ------------------------------------------------------------------ #
# Transaction                                                         #
# ------------------------------------------------------------------ #

class Transaction(BaseModel):
    """
    One transaction row exactly as it appears in the bank statement.
    No summarisation, no merging, no computed totals.
    """

    bank_name: Optional[str] = Field(
        default=None,
        description="Name of the issuing bank as printed on the statement.",
    )
    account_holder_name: Optional[str] = Field(
        default=None,
        description="Full name of the account holder.",
    )
    account_number: Optional[str] = Field(
        default=None,
        description="Masked or full account number as shown on the statement.",
    )
    account_type: Optional[str] = Field(
        default=None,
        description="E.g. 'Savings', 'Current', 'Credit Card'.",
    )
    txn_type: Optional[str] = Field(
        default=None,
        description="'debit' when money leaves the account, 'credit' when money arrives.",
    )
    mode: Optional[str] = Field(
        default=None,
        description="Payment mode: 'UPI', 'NEFT', 'RTGS', 'IMPS', 'Cheque', 'ATM', 'POS', etc.",
    )
    category: Optional[str] = Field(
        default=None,
        description="Inferred spend category, e.g. 'Food', 'Travel', 'Utilities'.",
    )
    amount: Optional[str] = Field(
        default=None,
        description=(
            "Transaction amount as a numeric string without currency symbol "
            "(e.g. '1234.56'). Always positive; direction is captured in txn_type."
        ),
    )
    currency: Optional[str] = Field(
        default=None,
        description="ISO-4217 settlement currency code (e.g. 'INR', 'USD', 'EUR').",
    )
    original_currency: Optional[str] = Field(
        default=None,
        description="ISO-4217 code of the original currency for cross-currency transactions.",
    )
    inr_equivalent: Optional[str] = Field(
        default=None,
        description="INR equivalent amount as a numeric string, for foreign-currency transactions.",
    )
    txn_date: Optional[str] = Field(
        default=None,
        description=(
            "Transaction date as printed. Prefer ISO-8601 (YYYY-MM-DD); "
            "otherwise keep the original string (e.g. '15 Jan 2024', '01/15/24')."
        ),
    )
    counterparty: Optional[str] = Field(
        default=None,
        description="Name of the merchant, sender, or recipient.",
    )
    counterparty_kind: Optional[str] = Field(
        default=None,
        description="Nature of the counterparty: 'merchant', 'individual', 'bank', 'government', etc.",
    )
    vpa: Optional[str] = Field(
        default=None,
        description="UPI Virtual Payment Address if present (e.g. 'user@upi').",
    )
    ref_number: Optional[str] = Field(
        default=None,
        description="Bank reference number, UTR, cheque number, or any transaction ID on the row.",
    )
    balance_after_txn: Optional[float] = Field(
        default=None,
        description="Running balance after this transaction, as a float.",
    )
    balance_label: Optional[str] = Field(
        default=None,
        description="Label qualifying the balance, e.g. 'Cr', 'Dr', 'Available'.",
    )
    place: Optional[str] = Field(
        default=None,
        description="City, branch, or location associated with the transaction if shown.",
    )
    narration: Optional[str] = Field(
        default=None,
        description="Full narration / remarks exactly as printed on the statement row.",
    )
    parser_metadata: ParserMetadata = Field(
        default_factory=ParserMetadata,
        description="Internal metadata about how and when this record was extracted.",
    )


# ------------------------------------------------------------------ #
# Batch / extraction envelope — used for Structured Output schema    #
# ------------------------------------------------------------------ #

class TransactionBatch(BaseModel):
    """
    Wrapper returned by the Vision model for one batch of pages.
    `transactions` must contain EVERY row visible in those pages —
    never summarised, never merged.
    """

    transactions: list[Transaction] = Field(
        default_factory=list,
        description=(
            "One Transaction object per row in the statement. "
            "Do NOT merge rows. Do NOT skip rows. Do NOT calculate totals."
        ),
    )
    pages_processed: list[int] = Field(
        default_factory=list,
        description="1-based page numbers included in this batch.",
    )
    extraction_notes: Optional[str] = Field(
        default=None,
        description="Any caveats about image quality, partial visibility, etc.",
    )


# ------------------------------------------------------------------ #
# Extraction log entry                                                #
# ------------------------------------------------------------------ #

class ExtractionLogEntry(BaseModel):
    batch_index: int
    pages: list[int]
    raw_count: int
    valid_count: int
    invalid_count: int
    invalid_records: list[Transaction] = Field(default_factory=list)
    error: Optional[str] = None
    extraction_notes: Optional[str] = None