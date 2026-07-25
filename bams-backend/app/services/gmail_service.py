import base64
from datetime import datetime, timedelta
import random
import re
from concurrent.futures import ThreadPoolExecutor
from email.utils import parsedate_to_datetime
from html import unescape
import time

from google.auth.transport.requests import Request
import requests
from ..core.constants import (
    BASE_RETRY_DELAY_SECONDS,
    DEFAULT_EMAIL_FETCH_LIMIT,
    GMAIL_BACKFILL_DAYS,
    GMAIL_DETAIL_WORKERS,
    GMAIL_MESSAGE_DETAIL_URL,
    GMAIL_MESSAGES_URL,
    GMAIL_PAGE_SIZE,
    GMAIL_READ_SCOPE,
    MAX_EMAIL_BODY_CHARS,
    MAX_RETRY_ATTEMPTS,
    MAX_RETRY_DELAY_SECONDS,
    PAGE_THROTTLE_SECONDS,
    RETRYABLE_STATUS_CODES,
    TRACKED_EMAIL_DOMAINS,
)
from ..models.user import User
from .credentials import build_credentials, get_token_scopes_from_tokeninfo


def _auth_headers_for_credentials(creds) -> dict[str, str] | None:
    """ Given a Google credentials object, return the Authorization header for API requests. 
    If the credentials are expired and have a refresh token, it will attempt to refresh them. 
    If the credentials are invalid or cannot be refreshed, it returns None.
    This prevents stale-token crashes during longer syncs."""

    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    if not creds.token:
        return None
    return {"Authorization": f"Bearer {creds.token}"}



# ---------------------------- Helper functions for domain -------------------------------
def _extract_domain(from_header: str) -> str:
    """Extract the sender domain from a Gmail From header. John Doe <john@github.com> ---> github.com, Domain extraction"""
    if not from_header:
        return ""
    if "@" not in from_header:
        return ""
    address = from_header.split("@")[-1].strip().lower()
    if ">" in address:
        address = address.split(">")[0].strip()
    return address

def _tracked_domains() -> list[str]:
    """Sanitizes the hardcoded TRACKED_EMAIL_DOMAINS, by stripping unnecessary whitespace and convert everything to lowercase"""
    return [
        domain.strip().lower()
        for domain in TRACKED_EMAIL_DOMAINS
        if domain.strip()
    ]

def _is_tracked_sender(from_header: str) -> bool:
    """To check if the sender is from the desired domain."""
    domain = _extract_domain(from_header)
    return any(
        domain == tracked_domain or domain.endswith(f".{tracked_domain}")
        for tracked_domain in _tracked_domains()
    )




# ---------------------------- Function to make queries to call gmail API ----------------
def _build_sender_query() -> str:
    """Generates a Gmail search query string. For instance, if you track github.com and flodataanalytics.com, 
        it outputs {from:github.com from:flodataanalytics.com},"""

    sender_filters = [f"from:{domain}" for domain in _tracked_domains()]
    if len(sender_filters) == 1:
        return sender_filters[0]
    return "{" + " ".join(sender_filters) + "}"

def _build_date_window_query(
    days: int | None = GMAIL_BACKFILL_DAYS,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> str:
    """Extends the search syntax by attaching time constraints using after:YYYY/MM/DD and before:YYYY/MM/DD filters."""

    end_day = (end_date or datetime.utcnow()).date() + timedelta(days=1)
    start_day = start_date.date() if start_date else end_day - timedelta(days=days or GMAIL_BACKFILL_DAYS)

    return (
        f"{_build_sender_query()} "
        f"after:{start_day.strftime('%Y/%m/%d')} "
        f"before:{end_day.strftime('%Y/%m/%d')}"
    )



# --------------------------- Cleaning and decoder function  ------------------------------
def _format_email_date(date_header: str) -> str:
    """Return the Gmail date header without timezone details."""
    if not date_header:
        return ""

    try:
        parsed_date = parsedate_to_datetime(date_header)
        return parsed_date.strftime("%a, %d %b %Y %H:%M:%S")
    except (TypeError, ValueError, IndexError, AttributeError):
        date_parts = date_header.split()
        if len(date_parts) >= 5:
            return " ".join(date_parts[:5])
        return date_header

def _decode_gmail_base64(raw_data: str) -> str:
    """Google passes email bodies over web parameters using a slightly modified base64 format (base64url). 
        This method replaces - and _ characters back into standard base64 variants, appends required = padding, and decodes it to raw text."""

    
    if not raw_data:
        return ""

    raw_data = raw_data.replace("-", "+").replace("_", "/")
    padding = len(raw_data) % 4
    if padding:
        raw_data += "=" * (4 - padding)

    try:
        decoded_bytes = base64.b64decode(raw_data)
        return decoded_bytes.decode("utf-8", errors="replace")
    except Exception:
        return ""

def _clean_html(html_content: str) -> str:
    """Drops all HTML tags, decodes entities, and collapses deeply nested whitespace/newlines."""
    if not html_content:
        return ""
    
    # Replace HTML tags with a space (prevents words from smashing together)
    text = re.sub(r"<[^>]+>", " ", html_content)
    
    # Decode HTML entities like &#39; or &amp;
    text = unescape(text)
    
    # Process line-by-line to clear out the heavy indentation
    cleaned_lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:  # Only keep lines that actually contain text
            cleaned_lines.append(stripped)
            
    # Join everything back together with a single newline
    return "\n".join(cleaned_lines)

def _extract_message_body(payload: dict) -> str:
    """Email payloads are often trees of nested data structures ("multipart" emails containing plain text, HTML, and attachments). 
        This recursive method drills down to find either a purely plain-text body or an HTML body it can strip down to plain text."""

    if not payload:
        return ""

    mime_type = payload.get("mimeType", "").lower()

    if mime_type == "text/plain":
        return _decode_gmail_base64(payload.get("body", {}).get("data", ""))

    if mime_type == "text/html":
        return _clean_html(_decode_gmail_base64(payload.get("body", {}).get("data", "")))

    for part in payload.get("parts", []) or []:
        text = _extract_message_body(part)
        if text:
            return text

    return ""




# --------------------------- Functions to fetch emails ------------------------------------
def _request_get_with_backoff(url: str, **kwargs) -> requests.Response:
    """ A robust network wrapper around the requests library implementing exponential backoff with jitter. 
        If it encounters a transient rate limit error (like HTTP 429 or 5xx status codes), it pauses and automatically retries. """
    
    for attempt in range(MAX_RETRY_ATTEMPTS):
        try:
            response = requests.get(url, **kwargs)
        except requests.RequestException:
            if attempt == MAX_RETRY_ATTEMPTS - 1:
                raise
        else:
            if response.status_code not in RETRYABLE_STATUS_CODES:
                return response
            if attempt == MAX_RETRY_ATTEMPTS - 1:
                return response
        
        # Implementing exponential backoff
        delay = min(
            BASE_RETRY_DELAY_SECONDS * (2 ** attempt) + random.uniform(0, 0.5),
            MAX_RETRY_DELAY_SECONDS,
        )
        time.sleep(delay)

    return requests.get(url, **kwargs)

def _fetch_message_detail(headers: dict, message_id: str) -> dict | None:
    """ It is the main function that will fetch mails, from the already fetched message id's. 
        Hits the full data endpoint for a single specific message to retrieve structural header mappings and content blobs."""

    if not message_id:
        return None

    try:
        detail_response = _request_get_with_backoff(
            GMAIL_MESSAGE_DETAIL_URL.format(message_id=message_id),
            headers=headers,
            params={"format": "full"},
            timeout=10,
        )
        if detail_response.status_code == 200:
            return detail_response.json()
        print(f"Failed to fetch message detail {message_id}: HTTP {detail_response.status_code}")
    except Exception as error:
        print(f"Error fetching message detail for {message_id}: {error}")

    return None

def _parse_message_detail(detail: dict) -> dict | None:
    """ Transforms raw API structural dictionary inputs into your finalized, flat dictionary model mapping fields. """

    if not detail:
        return None

    headers_list = detail.get("payload", {}).get("headers", [])
    headers_dict = {item.get("name"): item.get("value") for item in headers_list}

    sender = headers_dict.get("From", "")
    if not _is_tracked_sender(sender):
        return None

    return {
        "id": detail.get("id"),
        "threadId": detail.get("threadId"),
        "internalDate": int(detail.get("internalDate", 0) or 0),
        "from": sender,
        "subject": headers_dict.get("Subject", "(No Subject)"),
        "date": _format_email_date(headers_dict.get("Date", "")),
        "snippet": detail.get("snippet", ""),
        "body": _extract_message_body(detail.get("payload", {}))[:MAX_EMAIL_BODY_CHARS],
    }




# ------------------ Main functions ----------------
def verify_gmail_access(user: User, db=None) -> dict:
    """Verify if the user's access token has Gmail read permissions and return the scopes and access status."""
    creds = build_credentials(user)
    headers = _auth_headers_for_credentials(creds)
    if not headers:
        return {"gmail_read_access": False, "scopes": []}

    scopes = get_token_scopes_from_tokeninfo(creds.token)
    has_access = GMAIL_READ_SCOPE in scopes
    return {"gmail_read_access": has_access, "scopes": scopes}

# Function to fetch emails for returning users
def fetch_user_emails(user: User, max_results: int = DEFAULT_EMAIL_FETCH_LIMIT) -> dict:
    """Fetch the user's most recent Gmail emails from tracked sender domains."""
    
    creds = build_credentials(user)
    headers = _auth_headers_for_credentials(creds)
    if not headers:
        return {"emails": [], "message": "No access token available."}
    if not _tracked_domains():
        return {"emails": [], "message": "No tracked sender domains configured."}

    fetch_limit = max(1, min(max_results, 500))

    # Use Gmail's index search to fetch only emails from configured sender domains.
    params = {"maxResults": fetch_limit, "q": _build_sender_query()}

    response = _request_get_with_backoff(GMAIL_MESSAGES_URL, headers=headers, params=params, timeout=10)
    if response.status_code != 200:
        return {"emails": [], "message": "Failed to fetch email list from Gmail."}

    messages = response.json().get("messages", [])
    if not messages:
        return {"emails": [], "message": "No tracked emails found in this account."}

    parsed_emails = hydrate_user_message_page(user, messages)

    return {"emails": parsed_emails}

def iter_user_message_pages(
    user: User,
    days: int = GMAIL_BACKFILL_DAYS,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    page_size: int = GMAIL_PAGE_SIZE,
):
    """Yield sparse Gmail message pages before hydrating full bodies.
    It only fetches message IDs not whole body or whole object, So we can check DB, what msg id's are new and only hydrate for those ids only"""

    creds = build_credentials(user)
    if not _tracked_domains():
        return

    query = _build_date_window_query(days=days, start_date=start_date, end_date=end_date)
    page_token = None
    fetch_limit = max(1, min(page_size, 500))

    page_index = 1
    while True:
        headers = _auth_headers_for_credentials(creds)
        if not headers:
            return

        params = {
            "maxResults": fetch_limit,
            "q": query,
        }
        if page_token:
            params["pageToken"] = page_token

        response = _request_get_with_backoff(
            GMAIL_MESSAGES_URL,
            headers=headers,
            params=params,
            timeout=10,
        )
        if response.status_code != 200:
            raise RuntimeError(f"Failed to fetch Gmail message page: HTTP {response.status_code}")

        payload = response.json()
        messages = payload.get("messages", [])
        estimate = payload.get("resultSizeEstimate", len(messages))
        total_pages = max(1, (estimate + fetch_limit - 1) // fetch_limit)

        if messages:
            yield messages, page_index, total_pages

        page_token = payload.get("nextPageToken")
        if not page_token:
            break

        page_index += 1
        time.sleep(PAGE_THROTTLE_SECONDS)


def hydrate_user_message_page(
    user: User,
    messages: list[dict],
    detail_workers: int = GMAIL_DETAIL_WORKERS,
) -> list[dict]:
    """Hydrate sparse Gmail message IDs into parsed email payloads.
    This receives only the filtered/new Gmail IDs and fetches full email body/details"""
    if not messages:
        return []

    creds = build_credentials(user)
    headers = _auth_headers_for_credentials(creds)
    if not headers:
        return []

    worker_count = max(1, min(detail_workers, GMAIL_DETAIL_WORKERS, len(messages)))
    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        details = list(
            executor.map(
                lambda msg: _fetch_message_detail(headers, msg.get("id")),
                messages,
            )
        )

    parsed_emails = [
        parsed_email
        for parsed_email in (_parse_message_detail(detail) for detail in details)
        if parsed_email
    ]
    parsed_emails.sort(key=lambda email: email.get("internalDate", 0), reverse=True)

    return parsed_emails


def get_latest_gmail_message_id(user: User) -> str | None:
    """Fetch only the single most recent message ID from Gmail for tracked domains."""
    creds = build_credentials(user)
    headers = _auth_headers_for_credentials(creds)
    if not headers:
        return None
    if not _tracked_domains():
        return None

    params = {"maxResults": 1, "q": _build_sender_query()}

    response = _request_get_with_backoff(GMAIL_MESSAGES_URL, headers=headers, params=params, timeout=10)
    if response.status_code != 200:
        return None

    messages = response.json().get("messages", [])
    if not messages:
        return None

    return messages[0].get("id")
