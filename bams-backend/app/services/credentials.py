import requests
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from ..config import settings

TOKENINFO_URL = "https://www.googleapis.com/oauth2/v3/tokeninfo"


def build_credentials(user) -> Credentials:
    """Build Google Credentials object from user's stored tokens and refresh if necessary."""
    creds = Credentials(
        token=user.access_token,
        refresh_token=user.refresh_token,
        token_uri='https://oauth2.googleapis.com/token',
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        expiry=user.token_expiry,
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return creds


def get_token_scopes_from_tokeninfo(access_token: str) -> list[str]:
    """Return a list of scopes associated with an access token using tokeninfo endpoint."""
    if not access_token:
        return []
    response = requests.get(TOKENINFO_URL, params={"access_token": access_token})
    if response.status_code != 200:
        return []
    return response.json().get("scope", "").split()
