from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Mapping


def normalize_emails(emails: list[str]) -> list[str]:
    normalized: list[str] = []
    seen = set()

    for email in emails:
        cleaned = email.strip().lower()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            normalized.append(cleaned)

    return normalized


def email_timestamp(email: dict) -> float:
    try:
        return parsedate_to_datetime(email.get("date", "")).timestamp()
    except (TypeError, ValueError, IndexError, AttributeError, OverflowError):
        return 0


def email_internal_datetime(email: dict) -> datetime | None:
    try:
        internal_date = email.get("internalDate")
        if not internal_date:
            return None
        return datetime.fromtimestamp(int(internal_date) / 1000, tz=timezone.utc).replace(tzinfo=None)
    except (TypeError, ValueError, OSError, OverflowError):
        return None


def latest_email_datetime(emails: list[dict]) -> datetime | None:
    email_dates = [
        email_date
        for email_date in (email_internal_datetime(email) for email in emails)
        if email_date
    ]
    return max(email_dates) if email_dates else None


def parse_sheet_email_row(row: list[str], extra_fields: Mapping[str, Any] | None = None) -> dict | None:
    if not row:
        return None

    row_padded = row + [""] * (6 - len(row))
    email = {
        "id": row_padded[0],
        "subject": row_padded[1],
        "date": row_padded[2],
        "status": row_padded[3],
        "snippet": row_padded[4],
        "body": row_padded[5],
    }

    if extra_fields:
        email.update(extra_fields)

    return email

