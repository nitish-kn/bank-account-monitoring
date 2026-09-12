"""
Account lookup utility for matching and filling account details from Excel file.
"""

import difflib
import os
import re
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


def _normalize_account_digits(value: Any) -> Optional[str]:
    """Strip whitespace/separators so account numbers with different
    formatting (spaces, dashes) still compare equal. Returns None for
    masked values (e.g. "XX6744") -- those aren't a "full" number and must
    go through the last-4-digit path instead."""
    text = re.sub(r"[\s-]+", "", str(value or "").strip())
    if not text or not text.isdigit():
        return None
    return text


def find_account_by_full_number(account_number: str, df: pd.DataFrame) -> Optional[Dict[str, Any]]:
    """
    Find account details by an EXACT full account-number match. Preferred
    over last-4-digit matching whenever the statement prints a full,
    unmasked account number -- matching on just the last 4 digits alone can
    collide across two different accounts that happen to share a suffix.

    Only matches when both the incoming number and the sheet's "Axis A/c No"
    value normalize to plausible full numbers (>= 8 digits) -- short/masked
    values are left for find_account_in_excel's last-4 fallback.
    """
    if not isinstance(df, pd.DataFrame) or df.empty:
        return None

    account_col = "Axis A/c No"
    if account_col not in df.columns:
        return None

    target = _normalize_account_digits(account_number)
    if not target or len(target) < 8:
        return None

    normalized_col = df[account_col].apply(_normalize_account_digits)
    matching_accounts = df[normalized_col == target]

    if matching_accounts.empty:
        return None

    match = matching_accounts.iloc[0]

    return {
        "bank_name": match.get("S No"),
        "account_holder_name": match.get("Name"),
        "account_type": match.get("Type"),
        "account_number": str(match.get(account_col)),
        "category": match.get("Category"),
    }


def find_account_in_excel(last_four_digits: str, df: pd.DataFrame) -> Optional[Dict[str, Any]]:
    """
    Find account details in the Excel data by matching last 4 digits.

    Args:
        last_four_digits: Last 4 digits of account number (e.g., "1234")
        df: DataFrame with bank accounts data

    Returns:
        dict: Account details (bank_name, account_holder_name, account_type, account_number, category) or None if not found
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
        "category": match.get("Category"),
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


def list_all_accounts_from_excel(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Every row on the reference sheet, in the same dict shape find_account_in_excel
    returns. A bank_accounts DB row only exists once a transaction or statement has
    actually touched that account (see ledger_service.py) -- an account sitting on
    this sheet with no activity yet is otherwise invisible to any DB-only listing.
    """
    account_col = "Axis A/c No"
    if not isinstance(df, pd.DataFrame) or df.empty or account_col not in df.columns:
        return []

    accounts = []
    for _, row in df.iterrows():
        account_number = _clean_account_value(row.get(account_col))
        if not account_number:
            continue

        accounts.append({
            "bank_name": row.get("S No"),
            "account_holder_name": row.get("Name"),
            "account_type": row.get("Type"),
            "account_number": account_number,
        })

    return accounts


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


def _uppercase_extracted_account_fields(transaction: Dict[str, Any]) -> Dict[str, Any]:
    """No mapping-sheet match -- keep whatever the LLM itself extracted
    (account_number, account_holder_name, bank_name, account_type) rather
    than discarding it, just normalized to upper case."""
    for field in ("account_number", "account_holder_name", "bank_name", "account_type"):
        value = transaction.get(field)
        if isinstance(value, str) and value:
            transaction[field] = value.upper()
    return transaction


def fill_missing_account_details(
    transaction: Dict[str, Any],
    df: pd.DataFrame = None,
    use_last_four_fallback: bool = True,
    uppercase_when_unmatched: bool = False,
) -> Dict[str, Any]:
    """
    Fill missing account details by matching account number from Excel file.

    Args:
        transaction: Transaction object/dict with account information
        df: Optional pre-loaded DataFrame. If None, will load it
        use_last_four_fallback: also try matching by last-4-digit suffix when
            there's no full-number match. The email flow keeps this on (a
            masked "XX6744" is all an email ever shows); the statement flow
            turns it off -- a statement usually prints the full number, and
            matching by suffix alone risks colliding across two accounts
            that happen to share the same last 4 digits.
        uppercase_when_unmatched: when no match is found at all, keep the
            LLM's own extracted values (upper-cased) instead of discarding
            the account identity. Used by the statement flow, where an
            unmatched account is still the statement's own account, just one
            not yet in Bank Accounts V1. The email flow leaves this off,
            since an unmatched email account may genuinely be a
            beneficiary's/counterparty's account rather than the customer's
            own (see extractor.py) and must stay null.

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

    # A full, unmasked account number is matched exactly first -- matching
    # by last-4-digit suffix alone can collide across two different accounts
    # that happen to share the same last 4 digits.
    match = find_account_by_full_number(account_number, df)
    if not match and use_last_four_fallback:
        last_four = extract_last_four_digits(account_number)
        match = find_account_in_excel(last_four, df) if last_four else None

    if not match:
        if uppercase_when_unmatched:
            return _uppercase_extracted_account_fields(transaction)

        # The account number in the email must belong to one of our own
        # monitored accounts (Bank Accounts V1). If it isn't in that file,
        # it's a counterparty's / unknown account — discard the account
        # identity entirely so we never attribute a transaction to an
        # account we don't own.
        transaction["account_number"] = None
        transaction["account_holder_name"] = None
        transaction["account_type"] = None
        transaction["account_category"] = None
        return transaction

    # Account number matched a known record — the mapping sheet's values
    # always win, regardless of whatever the email/statement itself shows.
    if match.get("bank_name"):
        transaction["bank_name"] = match["bank_name"]

    transaction["account_number"] = match["account_number"]

    if match.get("account_holder_name"):
        transaction["account_holder_name"] = match["account_holder_name"]

    if match.get("account_type"):
        transaction["account_type"] = match["account_type"]

    if match.get("category"):
        transaction["account_category"] = match["category"]

    return transaction
