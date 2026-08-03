"""
Account lookup utility for matching and filling account details from Excel file.
"""

import os
import re
from pathlib import Path
from typing import Any, Dict, Optional

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


def _digit_runs_in_filename(filename: str) -> list[str]:
    """
    Statement filenames typically look like:
        "Acct Statement_2021_23072026_13.03.16.pdf"
    where "2021" is the account's last 4 digits, "23072026" is a
    DDMMYYYY date, and "13.03.16" is a HH.MM.SS time. Some filenames
    instead embed the FULL account number somewhere in the name. This
    just returns every maximal digit run in the filename stem; callers
    decide which run is the account identifier.
    """
    if not filename:
        return []

    stem = Path(str(filename)).stem
    return re.findall(r"\d+", stem)


def extract_account_last4_from_filename(filename: str) -> Optional[str]:
    """
    Pull the account's last-4 digits out of a statement filename, picking
    the first isolated 4-digit run (dates/times appear as runs of other
    lengths — 8/6 for dates, 1-2 for time fragments split on the dots).
    """
    candidates = [run for run in _digit_runs_in_filename(filename) if len(run) == 4]

    if not candidates:
        return None

    if len(candidates) > 1:
        print(
            f"Warning: filename '{filename}' has multiple ambiguous 4-digit "
            f"groups {candidates}; using the first one ('{candidates[0]}') as "
            "the account suffix."
        )

    return candidates[0]


def find_account_row_by_filename(filename: str, df: pd.DataFrame) -> Optional[pd.Series]:
    """
    Match a statement filename to its row in the bank accounts sheet.

    Filenames sometimes embed the FULL account number (e.g.
    "478010100035662") and sometimes only the last 4 digits (e.g. "2021"
    in "Acct Statement_2021_23072026_13.03.16.pdf"), alongside unrelated
    digit runs for the date/time. So we:
      1. Look for a digit run that EXACTLY matches a known account number
         first — unambiguous whenever the full number is present, and
         takes priority over any coincidental 4-digit suffix match.
      2. Otherwise fall back to matching isolated 4-digit runs against the
         account number's last 4 digits.
    """
    if not isinstance(df, pd.DataFrame) or df.empty:
        return None

    account_col = "Axis A/c No"
    if account_col not in df.columns:
        return None

    runs = _digit_runs_in_filename(filename)
    if not runs:
        return None

    account_numbers = df[account_col].astype(str)

    for run in runs:
        if len(run) < 4:
            continue
        exact_match = df[account_numbers == run]
        if not exact_match.empty:
            return exact_match.iloc[0]

    four_digit_runs = [run for run in runs if len(run) == 4]
    suffix_matches = []
    for run in four_digit_runs:
        rows = df[account_numbers.str.endswith(run)]
        if not rows.empty:
            suffix_matches.append((run, rows.iloc[0]))

    if not suffix_matches:
        return None

    if len(suffix_matches) > 1:
        print(
            f"Warning: filename '{filename}' has multiple ambiguous 4-digit "
            f"groups matching different accounts {[m[0] for m in suffix_matches]}; "
            f"using the first match ('{suffix_matches[0][0]}')."
        )

    return suffix_matches[0][1]


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


def get_pdf_password_from_filename(filename: str, df: pd.DataFrame = None) -> Optional[str]:
    """
    Resolve a statement PDF's open-password by matching the account
    (full account number, or failing that its last-4 digits) parsed from
    the filename against the bank accounts mapping sheet's "Password"
    column. Returns None if no matching/populated password is found.
    """
    if df is None:
        try:
            df = load_bank_accounts_data()
        except Exception as exc:
            print(f"Warning: Could not load bank accounts data: {exc}")
            return None

    row = find_account_row_by_filename(filename, df)
    if row is None:
        return None

    return _clean_account_value(row.get("Password"))


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
