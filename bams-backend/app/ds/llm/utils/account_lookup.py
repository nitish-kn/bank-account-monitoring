"""
Account lookup utility for matching and filling account details from Excel file.
"""

import difflib
import os
from typing import Any, Dict, List, Optional

import pandas as pd


def _clean_account_value(value: Any) -> Optional[str]:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = str(value).strip()
    return text or None


def load_bank_accounts_data() -> pd.DataFrame:
    """
    Load bank accounts data from the Excel file.

    Returns:
        DataFrame: Bank accounts data with columns: S No, Name, Type, Axis A/c No, Mobile No, Email ID
    """
    excel_path = os.path.join(
        os.path.dirname(__file__),
        "Bank Accounts V1.xlsx",
    )

    if not os.path.exists(excel_path):
        raise FileNotFoundError(f"Bank accounts file not found: {excel_path}")

    try:
        return pd.read_excel(excel_path, engine="openpyxl")
    except Exception as exc:
        raise ValueError(f"Error loading bank accounts file: {exc}") from exc


def extract_last_four_digits(account_number: str) -> Optional[str]:
    """
    Extract last 4 digits from account number.
    
    Args:
        account_number: Account number string (e.g., "xx1234" or "478010100035662")
    
    Returns:
        str: Last 4 digits or None if invalid
    """
    if not account_number:
        return None
    
    # Convert to string and remove any spaces
    account_str = str(account_number).strip()
    
    if len(account_str) >= 4:
        return account_str[-4:]
    
    return None


def get_all_bank_account_passwords(df: pd.DataFrame = None) -> list[str]:
    """
    Return every distinct, non-blank password in the bank accounts mapping
    sheet's "Password" column, in sheet order. A statement PDF's password is
    guaranteed to be one of these (if the account is one we monitor at all),
    so the caller can just try them all against the PDF rather than trying
    to first figure out which account the PDF belongs to.
    """
    if df is None:
        try:
            df = load_bank_accounts_data()
        except Exception as exc:
            print(f"Warning: Could not load bank accounts data: {exc}")
            return []

    if not isinstance(df, pd.DataFrame) or df.empty or "Password" not in df.columns:
        return []

    passwords = [
        cleaned
        for value in df["Password"]
        if (cleaned := _clean_account_value(value))
    ]

    # Dedupe while preserving order — no point trying the same password twice.
    return list(dict.fromkeys(passwords))


def find_account_in_excel(last_four_digits: str, df: pd.DataFrame) -> Optional[Dict[str, Any]]:
    """
    Find account details in the Excel data by matching last 4 digits.

    Args:
        last_four_digits: Last 4 digits of account number (e.g., "1234")
        df: DataFrame with bank accounts data

    Returns:
        dict: Account details (bank_name, account_holder_name, account_type, account_number) or None if not found
    """
    if not last_four_digits or not isinstance(df, pd.DataFrame) or df.empty:
        return None

    account_col = "Axis A/c No"
    if account_col not in df.columns:
        return None

    matching_accounts = df[
        df[account_col].astype(str).str.endswith(last_four_digits)
    ]

    if matching_accounts.empty:
        return None

    match = matching_accounts.iloc[0]

    return {
        "bank_name": match.get("S No"),
        "account_holder_name": match.get("Name"),
        "account_type": match.get("Type"),
        "account_number": str(match.get(account_col)),
    }


_FUZZY_FILLER_WORDS = {
    "my", "the", "a", "an", "for", "of", "is", "are", "and", "or", "to", "in",
    "on", "at", "account", "accounts", "card", "cards", "bank", "please", "whats",
}


def _significant_tokens(text: str) -> List[str]:
    return [
        token for token in str(text or "").lower().split()
        if len(token) >= 3 and token not in _FUZZY_FILLER_WORDS
    ]


def _token_substring_boost(query_tokens: List[str], *candidate_texts: str) -> float:
    """A whole-string SequenceMatcher ratio can bury a strong single-keyword
    hit under filler words -- e.g. "my axis account" vs "Axis Bank" scores
    0.58 (just under a 0.6 threshold) despite "axis" being an exact match.
    If any significant query token appears verbatim in a candidate field,
    that's worth crossing the threshold on its own."""
    for token in query_tokens:
        for candidate in candidate_texts:
            if token in candidate.lower():
                return 0.68
    return 0.0


def fuzzy_find_accounts_in_excel(
    query_text: str,
    df: pd.DataFrame,
    threshold: float = 0.6,
    limit: int = 3,
) -> List[Dict[str, Any]]:
    """
    Fallback for when there's no usable digit signal to match on (e.g. "my
    HDFC savings account", "Arvind's account" -- no account number at all).
    find_account_in_excel() only ever matches by last-4-digit suffix, so a
    name/bank-only query gets zero grounding from this sheet no matter how
    many rows it has; this scans every row's Name/S No (bank name -- despite
    the header, that's what this column actually holds, same as
    find_account_in_excel's mapping) and ranks by similarity instead.

    Returns the top matches at or above `threshold`, best first. The
    threshold is deliberately a loose floor (excludes only clearly-irrelevant
    rows) rather than a precision cutoff -- callers are expected to handle
    multiple close candidates (e.g. several same-surname holders) themselves,
    same as the digit-based path already does via tie-breaking elsewhere.
    """
    if not query_text or not isinstance(df, pd.DataFrame) or df.empty:
        return []

    account_col = "Axis A/c No"
    if account_col not in df.columns:
        return []

    query = str(query_text).strip().lower()
    if not query:
        return []

    query_tokens = _significant_tokens(query)

    scored: list[tuple[float, Dict[str, Any]]] = []
    for _, row in df.iterrows():
        name = str(row.get("Name") or "").strip()
        bank_name = str(row.get("S No") or "").strip()
        candidate_text = f"{name} {bank_name}".strip().lower()
        if not candidate_text:
            continue

        score = max(
            difflib.SequenceMatcher(None, query, name.lower()).ratio(),
            difflib.SequenceMatcher(None, query, bank_name.lower()).ratio(),
            difflib.SequenceMatcher(None, query, candidate_text).ratio(),
            _token_substring_boost(query_tokens, name, bank_name),
        )
        if score < threshold:
            continue

        scored.append((score, {
            "bank_name": row.get("S No"),
            "account_holder_name": row.get("Name"),
            "account_type": row.get("Type"),
            "account_number": str(row.get(account_col)),
        }))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [match for _, match in scored[:limit]]


def fill_missing_account_details(transaction: Dict[str, Any], df: pd.DataFrame = None) -> Dict[str, Any]:
    """
    Fill missing account details by matching account number from Excel file.

    Args:
        transaction: Transaction object/dict with account information
        df: Optional pre-loaded DataFrame. If None, will load it

    Returns:
        dict: Transaction with filled account details
    """
    if df is None:
        try:
            df = load_bank_accounts_data()
        except Exception as exc:
            print(f"Warning: Could not load bank accounts data: {exc}")
            return transaction

    account_number = transaction.get("account_number")
    if not account_number:
        return transaction

    last_four = extract_last_four_digits(account_number)
    match = find_account_in_excel(last_four, df) if last_four else None

    # The account number in the email must belong to one of our own monitored
    # accounts (Bank Accounts V1). If it isn't in that file, it's a
    # counterparty's / unknown account — discard the account identity entirely
    # so we never attribute a transaction to an account we don't own.
    if not match:
        transaction["account_number"] = None
        transaction["account_holder_name"] = None
        transaction["account_type"] = None
        return transaction

    if match.get("bank_name"):
        transaction["bank_name"] = match["bank_name"]

    # if not transaction.get("account_number") or len(str(transaction.get("account_number", ""))) < 10:
    transaction["account_number"] = match["account_number"]

    # Account number matched a known record — the Excel name always wins,
    # regardless of whatever name the email/statement itself shows.
    if match.get("account_holder_name"):
        transaction["account_holder_name"] = match["account_holder_name"]

    if match.get("account_type"):
        transaction["account_type"] = match["account_type"]

    return transaction
