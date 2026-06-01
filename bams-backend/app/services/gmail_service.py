import requests
from concurrent.futures import ThreadPoolExecutor
from email.utils import parsedate_to_datetime
from ..models.user import User
from .credentials import build_credentials, get_token_scopes_from_tokeninfo

GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
GMAIL_MESSAGES_URL = "https://www.googleapis.com/gmail/v1/users/me/messages"
GMAIL_MESSAGE_DETAIL_URL = "https://www.googleapis.com/gmail/v1/users/me/messages/{message_id}"
DEFAULT_EMAIL_FETCH_LIMIT = 100
TRACKED_EMAIL_DOMAINS = [
    "github.com",
    "flodataanalytics.com",
]


def _extract_domain(from_header: str) -> str:
    """Extract the sender domain from a Gmail From header."""
    if not from_header:
        return ""
    if "@" not in from_header:
        return ""
    address = from_header.split("@")[-1].strip().lower()
    if ">" in address:
        address = address.split(">")[0].strip()
    return address


def _tracked_domains() -> list[str]:
    return [
        domain.strip().lower()
        for domain in TRACKED_EMAIL_DOMAINS
        if domain.strip()
    ]


def _is_tracked_sender(from_header: str) -> bool:
    domain = _extract_domain(from_header)
    return any(
        domain == tracked_domain or domain.endswith(f".{tracked_domain}")
        for tracked_domain in _tracked_domains()
    )


def _build_sender_query() -> str:
    sender_filters = [f"from:{domain}" for domain in _tracked_domains()]
    if len(sender_filters) == 1:
        return sender_filters[0]
    return "{" + " ".join(sender_filters) + "}"


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


def verify_gmail_access(user: User, db=None) -> dict:
    """Verify if the user's access token has Gmail read permissions and return the scopes and access status."""
    creds = build_credentials(user)
    active_token = creds.token
    if not active_token:
        return {"gmail_read_access": False, "scopes": []}

    scopes = get_token_scopes_from_tokeninfo(active_token)
    has_access = GMAIL_READ_SCOPE in scopes
    return {"gmail_read_access": has_access, "scopes": scopes}


def fetch_user_emails(user: User, max_results: int = DEFAULT_EMAIL_FETCH_LIMIT) -> dict:
    """Fetch the user's most recent Gmail emails from tracked sender domains."""
    creds = build_credentials(user)
    active_token = creds.token
    if not active_token:
        return {"emails": [], "message": "No access token available."}
    if not _tracked_domains():
        return {"emails": [], "message": "No tracked sender domains configured."}

    headers = {"Authorization": f"Bearer {active_token}"}
    fetch_limit = max(1, min(max_results, 500))
    # Use Gmail's index search to fetch only emails from configured sender domains.
    params = {"maxResults": fetch_limit, "q": _build_sender_query()}

    response = requests.get(GMAIL_MESSAGES_URL, headers=headers, params=params, timeout=10)
    if response.status_code != 200:
        return {"emails": [], "message": "Failed to fetch email list from Gmail."}

    messages = response.json().get("messages", [])
    if not messages:
        return {"emails": [], "message": "No tracked emails found in this account."}

    # Optimization 2: Use a ThreadPoolExecutor to fetch message details concurrently.
    # This replaces the slow N+1 sequential loops with a concurrent batch fetch.
    def fetch_detail(msg):
        message_id = msg.get("id")
        if not message_id:
            return None
        try:
            detail_response = requests.get(
                GMAIL_MESSAGE_DETAIL_URL.format(message_id=message_id),
                headers=headers,
                params={"format": "metadata", "metadataHeaders": ["From", "Subject", "Date"]},
                timeout=10,
            )
            if detail_response.status_code == 200:
                return detail_response.json()
        except Exception as e:
            print(f"Error fetching message detail for {message_id}: {e}")
        return None

    with ThreadPoolExecutor(max_workers=10) as executor:
        details = list(executor.map(fetch_detail, messages))

    parsed_emails = []
    for detail in details:
        if not detail:
            continue

        headers_list = detail.get("payload", {}).get("headers", [])
        headers_dict = {item.get("name"): item.get("value") for item in headers_list}

        sender = headers_dict.get("From", "")
        # Extra safety check, though Gmail search query 'q' has filtered this already
        if not _is_tracked_sender(sender):
            continue

        parsed_emails.append({
            "id": detail.get("id"),
            "threadId": detail.get("threadId"),
            "internalDate": int(detail.get("internalDate", 0) or 0),
            "from": sender,
            "subject": headers_dict.get("Subject", "(No Subject)"),
            "date": _format_email_date(headers_dict.get("Date", "")),
            "snippet": detail.get("snippet", ""),
        })

    parsed_emails.sort(key=lambda email: email.get("internalDate", 0), reverse=True)
    return {"emails": parsed_emails}
