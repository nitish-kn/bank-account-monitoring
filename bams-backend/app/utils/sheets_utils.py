from googleapiclient.errors import HttpError
from typing import Any


def _get_sheet_title(sheets_service: Any, spreadsheet_id: str) -> str:
    """Return the first sheet title from a spreadsheet. Fallback to Sheet1."""
    try:
        spreadsheet = sheets_service.spreadsheets().get(
            spreadsheetId=spreadsheet_id,
            fields="sheets(properties(title))"
        ).execute()
        sheets = spreadsheet.get("sheets", [])
        if sheets:
            return sheets[0].get("properties", {}).get("title", "Sheet1")
    except HttpError:
        pass
    return "Sheet1"


def _read_existing_column_values(
    sheets_service: Any,
    spreadsheet_id: str,
    sheet_title: str,
    column: str,
) -> set[str]:
    """Fetch a single sheet column, skipping the header row."""
    try:
        result = sheets_service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=f"'{sheet_title}'!{column}2:{column}",
        ).execute()
        return {row[0] for row in result.get("values", []) if row}
    except Exception as error:
        print(f"Failed to read existing sheet column {column}: {error}")
        return set()
    

def _append_sheet_rows(sheets_service: Any, spreadsheet_id: str, sheet_title: str, rows: list[list[str]]) -> dict:
    """ Low-level wrapper using the Google Sheets API .append() method to physically insert parsed array rows. """
    if not rows:
        return {"updated": False, "rows_written": 0}

    sheets_service.spreadsheets().values().append(
        spreadsheetId=spreadsheet_id,
        range=f"'{sheet_title}'!A2",
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body={"values": rows},
    ).execute()

    return {"updated": True, "rows_written": len(rows)}


def append_account_to_local_excel(bank_name: str, name: str, ac_type: str, account_no: str) -> bool:
    """Append a new bank account row to the local 'Bank Accounts V1.xlsx' spreadsheet.
    Resolves the file location in app/utils/ or app/ds/llm/utils/ robustly.
    """
    import os
    import openpyxl

    # 1. Search for the Excel file in app/utils first, then fallback to ds/llm/utils
    current_dir = os.path.dirname(os.path.abspath(__file__))
    path_options = [
        os.path.join(current_dir, "Bank Accounts V1.xlsx"),
        os.path.join(current_dir, "..", "ds", "llm", "utils", "Bank Accounts V1.xlsx"),
    ]
    
    excel_path = None
    for path in path_options:
        if os.path.exists(path):
            excel_path = path
            break
            
    if not excel_path:
        print("Excel file 'Bank Accounts V1.xlsx' was not found in any expected directory.")
        return False

    try:
        wb = openpyxl.load_workbook(excel_path)
        ws = wb.active # Default sheet ('Sheet1')
        
        # 2. Convert account number to int if numeric to match existing format
        try:
            cleaned_ac = account_no.strip()
            acc_val = int(cleaned_ac) if cleaned_ac.isdigit() else cleaned_ac
        except ValueError:
            acc_val = account_no.strip()

        # 3. Row schema matches ['S No' (Bank Name), 'Name', 'Type', 'Axis A/c No', 'Mobile No', 'Email ID']
        row_to_add = [
            bank_name.strip(),
            name.strip(),
            ac_type.strip(),
            acc_val,
            None, # Mobile No (optional)
            None  # Email ID (optional)
        ]
        
        ws.append(row_to_add)
        wb.save(excel_path)
        wb.close()
        return True
    except Exception as e:
        print(f"Failed to append account to local Excel sheet: {e}")
        return False
