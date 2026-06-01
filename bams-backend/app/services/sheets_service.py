import requests
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from sqlalchemy.orm import Session
from ..config import settings
from ..models.user import User
import requests
from sqlalchemy.orm import Session
from ..models.user import User
from .credentials import build_credentials, get_token_scopes_from_tokeninfo

DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"
SPREADSHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets"
SPREADSHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"


def verify_sheet_access(user: User, db: Session = None) -> dict:
    """Verify Sheets/Drive scopes for the user's current access token."""
    creds = build_credentials(user)
    active_token = creds.token
    if not active_token:
        return {"sheet_access": False, "scopes": []}

    scopes = get_token_scopes_from_tokeninfo(active_token)
    can_read = SPREADSHEETS_READONLY_SCOPE in scopes or SPREADSHEETS_SCOPE in scopes
    can_write = SPREADSHEETS_SCOPE in scopes or DRIVE_FILE_SCOPE in scopes
    has_access = can_read and can_write
    return {"sheet_access": has_access, "can_read": can_read, "can_write": can_write, "scopes": scopes}