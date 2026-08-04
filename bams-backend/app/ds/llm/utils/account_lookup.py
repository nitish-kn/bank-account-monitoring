"""
Account lookup utility for matching and filling account details from Excel file.
"""

import difflib
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, Optional

import pandas as pd

from ..services.llm_client import call_llm


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


def _find_account_row_by_digit_runs(
    runs: list[str],
    df: pd.DataFrame,
    label: str = "input",
) -> Optional[pd.Series]:
    """
    Shared core matcher: given a list of digit runs (pulled from a filename
    or free text), match against the bank accounts sheet.
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
            f"Warning: {label} has multiple ambiguous 4-digit "
            f"groups matching different accounts {[m[0] for m in suffix_matches]}; "
            f"using the first match ('{suffix_matches[0][0]}')."
        )

    return suffix_matches[0][1]


def find_account_row_by_filename(filename: str, df: pd.DataFrame) -> Optional[pd.Series]:
    """
    Match a statement filename to its row in the bank accounts sheet.

    Filenames sometimes embed the FULL account number (e.g.
    "478010100035662") and sometimes only the last 4 digits (e.g. "2021"
    in "Acct Statement_2021_23072026_13.03.16.pdf"), alongside unrelated
    digit runs for the date/time.
    """
    return _find_account_row_by_digit_runs(
        _digit_runs_in_filename(filename),
        df,
        label=f"filename '{filename}'",
    )


def find_account_row_by_hints(
    account_number_hint: Optional[str],
    bank_name_hint: Optional[str],
    account_holder_hint: Optional[str],
    df: pd.DataFrame,
) -> Optional[pd.Series]:
    """
    Match a row in the bank accounts sheet using best-effort hints (e.g.
    extracted by an LLM from an email body) rather than a filename.
      1. If an account number hint is present, digits-only clean it and
         match exactly / by last-4 (same core matcher as the filename path).
      2. Otherwise, fuzzy-match the bank name / account holder name hints
         against the sheet's "S No" (bank) and "Name" (holder) columns.
    """
    if not isinstance(df, pd.DataFrame) or df.empty:
        return None

    if account_number_hint:
        digits = re.sub(r"\D", "", str(account_number_hint))
        if len(digits) >= 4:
            row = _find_account_row_by_digit_runs(
                [digits], df, label="account number hint"
            )
            if row is not None:
                return row

    if not bank_name_hint and not account_holder_hint:
        return None

    bank_col, name_col = "S No", "Name"
    if bank_col not in df.columns or name_col not in df.columns:
        return None

    best_row = None
    best_score = 0.0
    threshold = 0.6

    for _, row in df.iterrows():
        if bank_name_hint:
            bank_score = difflib.SequenceMatcher(
                None, str(bank_name_hint).lower(), str(row.get(bank_col) or "").lower()
            ).ratio()
            if bank_score < threshold:
                continue
        else:
            bank_score = 1.0

        if account_holder_hint:
            name_score = difflib.SequenceMatcher(
                None, str(account_holder_hint).lower(), str(row.get(name_col) or "").lower()
            ).ratio()
            if name_score < threshold:
                continue
        else:
            name_score = 1.0

        combined = bank_score + name_score
        if combined > best_score:
            best_score, best_row = combined, row

    return best_row


def _guess_account_hints_via_llm(email_body: str) -> Optional[dict]:
    """
    Small, single-purpose LLM call: given a statement-delivery email's body
    text, best-effort extract whatever identifies which of our own monitored
    accounts (Bank Accounts V1) this statement belongs to. Only ever called
    for a PDF already confirmed to be password protected.
    """
    if not email_body or not str(email_body).strip():
        return None

    prompt = f"""
You are given the body text of an email that delivers/attaches a bank statement PDF.
Extract, best-effort, whatever identifies the account this statement belongs to.
Return ONLY a JSON object with exactly these keys (use null if not present — never invent a value):

{{
  "account_number": null,
  "bank_name": null,
  "account_holder_name": null
}}

- "account_number": full or partial/masked account number mentioned anywhere (e.g. "A/c No XXXXXX1234").
- "bank_name": the issuing bank name (from body text, signature, or obvious context).
- "account_holder_name": the customer/account holder's name if mentioned (e.g. a greeting "Dear Ram Niwas Gupta").

EMAIL BODY:
\"\"\"
{str(email_body)[:4000]}
\"\"\"
"""

    try:
        raw = call_llm(prompt)
        hints = json.loads(raw)
    except Exception as exc:
        print(f"Warning: could not extract account hints from email body via LLM: {exc}")
        return None

    if not isinstance(hints, dict):
        return None

    return hints


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


def get_pdf_password_from_email_body(email_body: str, df: pd.DataFrame = None) -> Optional[str]:
    """
    Resolve a statement PDF's open-password by first asking an LLM to pull
    account hints (account number / bank name / account holder name) out of
    the delivering email's body text, then matching those hints against the
    bank accounts mapping sheet's "Password" column.
    """
    hints = _guess_account_hints_via_llm(email_body)
    if not hints:
        return None

    if df is None:
        try:
            df = load_bank_accounts_data()
        except Exception as exc:
            print(f"Warning: Could not load bank accounts data: {exc}")
            return None

    row = find_account_row_by_hints(
        hints.get("account_number"),
        hints.get("bank_name"),
        hints.get("account_holder_name"),
        df,
    )
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
