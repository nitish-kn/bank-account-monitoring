"""
Account lookup utility for matching and filling account details from Excel file
"""

import os
import pandas as pd
from typing import Optional, Dict, Any


def load_bank_accounts_data():
    """
    Load bank accounts data from the Excel file.
    
    Returns:
        DataFrame: Bank accounts data with columns: S No, Name, Type, Axis A/c No, Mobile No, Email ID
    """
    excel_path = os.path.join(
        os.path.dirname(__file__),
        "Bank Accounts V1.xlsx"
    )
    
    if not os.path.exists(excel_path):
        raise FileNotFoundError(f"Bank accounts file not found: {excel_path}")
    
    try:
        df = pd.read_excel(excel_path)
        return df
    except Exception as e:
        raise ValueError(f"Error loading bank accounts file: {e}")


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
    
    # Filter accounts that end with the last 4 digits
    matching_accounts = df[
        df['Axis A/c No'].astype(str).str.endswith(last_four_digits)
    ]
    
    if matching_accounts.empty:
        return None
    
    # Use the first match if multiple exist
    match = matching_accounts.iloc[0]
    
    return {
        'bank_name': match.get('S No'),
        'account_holder_name': match.get('Name'),
        'account_type': match.get('Type'),
        'account_number': str(match.get('Axis A/c No'))
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
    # Load data if not provided
    if df is None:
        try:
            df = load_bank_accounts_data()
        except Exception as e:
            print(f"Warning: Could not load bank accounts data: {e}")
            return transaction
    
    # Only process if we have an account number
    account_number = transaction.get('account_number')
    if not account_number:
        return transaction
    
    # Extract last 4 digits
    last_four = extract_last_four_digits(account_number)
    if not last_four:
        return transaction
    
    # Find matching account in Excel
    match = find_account_in_excel(last_four, df)
    if not match:
        return transaction
    
    # Fill in missing fields with priority: bank_name > account_number > account_holder_name > account_type
    # Priority 1: Bank name (most important for matching)
    if not transaction.get('bank_name') and match.get('bank_name'):
        transaction['bank_name'] = match['bank_name']
    
    # Priority 2: Account number (fill if missing or partial)
    if not transaction.get('account_number') or len(str(transaction.get('account_number', ''))) < 10:
        transaction['account_number'] = match['account_number']
    
    # Priority 3: Account holder name
    if not transaction.get('account_holder_name') and match.get('account_holder_name'):
        transaction['account_holder_name'] = match['account_holder_name']
    
    # Priority 4: Account type
    if not transaction.get('account_type') and match.get('account_type'):
        transaction['account_type'] = match['account_type']
    
    return transaction
