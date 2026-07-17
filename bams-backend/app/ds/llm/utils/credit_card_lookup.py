"""
Credit card lookup utility for matching and filling credit card details from Excel file.
"""

import os
import re
from typing import Any, Dict, Optional

import pandas as pd


def load_credit_card_data() -> pd.DataFrame:
    """
    Load credit card mapping data from the Excel file.

    Returns:
        DataFrame: Credit card data with columns:
            S No, Credit Card Owner, Credit Card No., Credit Card Issuer, Card Name, Type
    """
    excel_path = os.path.join(
        os.path.dirname(__file__),
        "Credit Card Mapping.xlsx",
    )

    if not os.path.exists(excel_path):
        raise FileNotFoundError(f"Credit card mapping file not found: {excel_path}")

    try:
        return pd.read_excel(excel_path, engine="openpyxl")
    except Exception as exc:
        raise ValueError(f"Error loading credit card mapping file: {exc}") from exc


def _digits_only(value: Any) -> str:
    """
    Strip everything but digits. The sheet's "Credit Card No." column is
    formatted inconsistently (dashes grouped as 4-4-4-4, 4-6-5, or no
    separators at all) — comparing on digits only makes matching reliable
    regardless of formatting, without needing to rewrite the source file.
    """
    if value is None:
        return ""
    return re.sub(r"\D", "", str(value))


def _clean_cell(value: Any) -> Optional[str]:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = str(value).strip()
    return text or None


def extract_last_four_digits(card_number: str) -> Optional[str]:
    """
    Extract last 4 digits from a card number, ignoring any dashes/spaces
    (e.g. "4111-4606-0080-5976" or "XXXX XXXX XXXX 5976" -> "5976").
    """
    digits = _digits_only(card_number)

    if len(digits) >= 4:
        return digits[-4:]

    return None


def find_credit_card_in_excel(last_four_digits: str, df: pd.DataFrame) -> Optional[Dict[str, Any]]:
    """
    Find credit card details in the Excel data by matching last 4 digits.

    Args:
        last_four_digits: Last 4 digits of the card number (e.g. "5976")
        df: DataFrame with credit card mapping data

    Returns:
        dict: Card details (credit_card_number, credit_card_owner, credit_card_issuer,
              card_name, card_type) or None if not found
    """
    if not last_four_digits or not isinstance(df, pd.DataFrame) or df.empty:
        return None

    card_col = "Credit Card No."
    if card_col not in df.columns:
        return None

    cleaned_numbers = df[card_col].map(_digits_only)
    matching_cards = df[cleaned_numbers.str.endswith(last_four_digits)]

    if matching_cards.empty:
        return None

    match = matching_cards.iloc[0]

    return {
        "credit_card_number": _clean_cell(_digits_only(match.get(card_col)) or None),
        "credit_card_owner": _clean_cell(match.get("Credit Card Owner")),
        "credit_card_issuer": _clean_cell(match.get("Credit Card Issuer")),
        "card_name": _clean_cell(match.get("Card Name")),
        "card_type": _clean_cell(match.get("Type")),
    }


def fill_missing_credit_card_details(transaction: Dict[str, Any], df: pd.DataFrame = None) -> Dict[str, Any]:
    """
    For credit card transactions, look up the full card details from the
    mapping sheet using the last 4 digits the LLM captured from the email,
    and fill optional_fields with the owner/issuer/card name/type plus the
    full card number.

    No-op for anything that isn't a credit card transaction, or where we
    don't have at least a partial card number to match on.
    """
    if str(transaction.get("txn_via") or "").strip().lower() != "credit card":
        return transaction

    optional_fields = transaction.get("optional_fields")
    if not isinstance(optional_fields, dict):
        optional_fields = {}
        transaction["optional_fields"] = optional_fields

    card_number = optional_fields.get("credit_card_number")
    if not card_number:
        return transaction

    last_four = extract_last_four_digits(card_number)
    if not last_four:
        return transaction

    if df is None:
        try:
            df = load_credit_card_data()
        except Exception as exc:
            print(f"Warning: Could not load credit card mapping data: {exc}")
            return transaction

    match = find_credit_card_in_excel(last_four, df)
    if not match:
        return transaction

    if match.get("credit_card_number"):
        optional_fields["credit_card_number"] = match["credit_card_number"]

    if match.get("credit_card_owner"):
        optional_fields["credit_card_owner"] = match["credit_card_owner"]

    if match.get("credit_card_issuer"):
        optional_fields["credit_card_issuer"] = match["credit_card_issuer"]

    if match.get("card_name"):
        optional_fields["card_name"] = match["card_name"]

    if match.get("card_type"):
        optional_fields["card_type"] = match["card_type"]

    return transaction
