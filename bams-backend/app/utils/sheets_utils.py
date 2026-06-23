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


def _read_existing_email_ids(sheets_service: Any, spreadsheet_id: str, sheet_title: str) -> set[str]:
    """ Fetches column A (skipping the header) to extract historical email IDs. This prevents duplicate entries. """
    return _read_existing_column_values(sheets_service, spreadsheet_id, sheet_title, "A")


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
