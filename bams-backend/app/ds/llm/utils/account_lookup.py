"""
Account lookup utility for matching and filling account details from Excel file.
"""

import os
from typing import Any, Dict, Optional

import pandas as pd


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

    if not transaction.get("account_number") or len(str(transaction.get("account_number", ""))) < 10:
        transaction["account_number"] = match["account_number"]

    # Account number matched a known record — the Excel name always wins,
    # regardless of whatever name the email/statement itself shows.
    if match.get("account_holder_name"):
        transaction["account_holder_name"] = match["account_holder_name"]

    if match.get("account_type"):
        transaction["account_type"] = match["account_type"]

    return transaction
