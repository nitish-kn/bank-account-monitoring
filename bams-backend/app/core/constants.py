from pathlib import Path

from sqlalchemy import BigInteger, Integer

from ..ds.llm.schemas.transaction_schema import Transaction


# Paths
BACKEND_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_ROOT.parent
FRONTEND_DIST_DIR = PROJECT_ROOT / "bams-frontend" / "dist"
FRONTEND_INDEX_FILE = FRONTEND_DIST_DIR / "index.html"
UPLOAD_DIR = BACKEND_ROOT / "uploads"


# Settings defaults
DEFAULT_GOOGLE_REDIRECT_URI = "http://localhost:8000/api/auth/google/callback"
DEFAULT_SECRET_KEY = "your-secret-key"
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 300
DEFAULT_MODEL_NAME = "openai/gpt-oss-120b"
PARSER_NAME = "bank_transaction_extractor"
PARSER_VERSION = "1.0.0"


# Database/model helpers
ID_TYPE = BigInteger().with_variant(Integer, "sqlite")


# Google OAuth and API scopes
TOKENINFO_URL = "https://www.googleapis.com/oauth2/v3/tokeninfo"
GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"

GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"
SPREADSHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets"
SPREADSHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"


# Gmail sync
GMAIL_MESSAGES_URL = "https://www.googleapis.com/gmail/v1/users/me/messages"
GMAIL_MESSAGE_DETAIL_URL = "https://www.googleapis.com/gmail/v1/users/me/messages/{message_id}"
DEFAULT_EMAIL_FETCH_LIMIT = 100
GMAIL_BACKFILL_DAYS = 30
GMAIL_PAGE_SIZE = 100
GMAIL_DETAIL_WORKERS = 10
MAX_EMAIL_BODY_CHARS = 10000
MAX_RETRY_ATTEMPTS = 4
BASE_RETRY_DELAY_SECONDS = 1
MAX_RETRY_DELAY_SECONDS = 16
PAGE_THROTTLE_SECONDS = 0.35
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
TRACKED_EMAIL_DOMAINS = [
    "github.com",
    "flodataanalytics.com",
    "axis.bank.in",
    "hdfcbank.bank.in",
    "indusind.com",
    "kotak.bank.in",
]


# Transaction sheet schema
TRANSACTION_SCHEMA = list(Transaction.model_fields.keys())
GMAIL_MESSAGE_ID_FIELD = "gmail_message_id"
GMAIL_MESSAGE_ID_COLUMN = "B"
JSON_TRANSACTION_FIELDS = {"email_metadata", "parser_metadata", "optional_fields"}
VALID_TRANSACTION_TYPES = {"Debit", "Credit", "credit", "debit"}


def _column_name(column_number: int) -> str:
    name = ""
    while column_number:
        column_number, remainder = divmod(column_number - 1, 26)
        name = chr(65 + remainder) + name
    return name


TRANSACTION_SHEET_END_COLUMN = _column_name(len(TRANSACTION_SCHEMA))
TRANSACTION_HEADER_RANGE = f"A1:{TRANSACTION_SHEET_END_COLUMN}1"
TRANSACTION_DATA_RANGE = f"A2:{TRANSACTION_SHEET_END_COLUMN}"


# Sync/setup flow
REQUIRED_SCHEMA = TRANSACTION_SCHEMA
SHEET_NAME = "Transaction Data Local"
SYNC_STATUS_NOT_STARTED = "not_started"
SYNC_STATUS_RUNNING = "running"
SYNC_STATUS_COMPLETED = "completed"
SYNC_STATUS_FAILED = "failed"
SYNC_TIMEOUT_SECONDS = 30 * 60
EMAIL_EXTRACTION_BATCH_SIZE = 5
EMAIL_EXTRACTION_MAX_WORKERS = 2
EMAIL_EXTRACTION_MAX_IN_FLIGHT = 2


# Invite flow
FAMILY_INVITE = "family_invite"
JOIN_REQUEST = "join_request"
INVITE_STATUS_PENDING = "pending"
INVITE_STATUS_EXPIRED = "expired"
INVITE_STATUS_ACCEPTED = "accepted"
INVITE_STATUS_DECLINED = "declined"


# Parse status
PARSED_STATUS = "parsed"
NOT_TRANSACTION_STATUS = "not_transaction"
FAILED_STATUS = "failed"
STATUS_ALIASES = {
    "non_transaction": NOT_TRANSACTION_STATUS,
    "not_transaction": NOT_TRANSACTION_STATUS,
    "no_transaction": NOT_TRANSACTION_STATUS,
    "parsed": PARSED_STATUS,
    "failed": FAILED_STATUS,
}
TRANSACTION_DB_FIELDS = {
    "id",
    "user_id",
    "gmail_message_id",
    "bank_name",
    "account_holder_name",
    "account_type",
    "account_number",
    "txn_type",
    "mode",
    "category",
    "amount",
    "currency",
    "txn_date",
    "counterparty",
    "counterparty_kind",
    "narration",
    "txn_via",
    "ref_number",
    "place",
    "balance_after_txn",
    "source",
    "dedupe_key",
    "email_metadata",
    "parser_metadata",
    "optional_fields",
    "sheets_synced_at",
    "is_flag",
    "created_at",
    "updated_at",
}
