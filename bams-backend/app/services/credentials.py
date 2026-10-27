import requests
from google.auth.exceptions import RefreshError
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.errors import HttpError
from ..config import settings
from ..core.constants import GOOGLE_TOKEN_URI, TOKENINFO_URL


class GoogleAccessRevokedError(RuntimeError):
    """The org's Google authorization itself is dead -- consent revoked, or
    (common for an app still in Testing publishing status) the refresh token
    hit its 7-day expiry. Distinct from a transient network/rate-limit
    failure: there is nothing to retry here, the org must reconnect Google."""


# Substrings that show up in a 403's message/details when it's a rate limit
# or quota issue -- retryable, NOT a sign the org's access itself is gone.
# Covers both the Gmail-style discovery API ("rateLimitExceeded") and the
# newer google.rpc.Status shape some APIs (Sheets included) use
# ("RESOURCE_EXHAUSTED").
_TRANSIENT_REASON_HINTS = (
    "ratelimitexceeded", "userratelimitexceeded", "quotaexceeded",
    "resource_exhausted", "backenderror", "rate limit", "quota",
)


def is_google_access_revoked(error: Exception) -> bool:
    """Whether `error` means the org's Google authorization itself is dead --
    consent revoked, refresh token expired -- rather than a transient
    network/rate-limit failure that's simply retried on the next sync.
    Shared by every Google API call this app makes (Gmail's raw REST calls
    via gmail_service, and Sheets via googleapiclient's HttpError), so a
    revoked grant is recognized the same way everywhere, not just in Gmail. """
    if isinstance(error, (GoogleAccessRevokedError, RefreshError)):
        return True

    if isinstance(error, HttpError):
        status = error.status_code
        if status == 401:
            return True
        if status == 403:
            haystack = f"{error.reason} {error.error_details}".lower()
            return not any(hint in haystack for hint in _TRANSIENT_REASON_HINTS)

    return False


def build_credentials(org) -> Credentials:
    """Build Google Credentials object from org's stored tokens and refresh if necessary."""
    creds = Credentials(
        token=org.access_token,
        refresh_token=org.refresh_token,
        token_uri=GOOGLE_TOKEN_URI,
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        expiry=org.token_expiry,
    )
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except RefreshError as error:
            raise GoogleAccessRevokedError(str(error)) from error
    return creds


def get_token_scopes_from_tokeninfo(access_token: str) -> list[str]:
    """Return a list of scopes associated with an access token using tokeninfo endpoint."""
    if not access_token:
        return []
    response = requests.get(TOKENINFO_URL, params={"access_token": access_token})
    if response.status_code != 200:
        return []
    return response.json().get("scope", "").split()
