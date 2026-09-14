from datetime import datetime, timezone
from zoneinfo import ZoneInfo

# Bank statements/emails report transaction timestamps in India Standard
# Time with no offset in the raw text (e.g. "29-Aug-2026 17:54:21"). A naive
# datetime built from that text must be tagged with *this*, not left naive --
# a naive value handed to a `timestamptz` column gets tagged with whatever
# timezone the connecting Postgres session happens to default to, which is
# why the same value showed up as +05:30 locally and +00 on the server.
IST = ZoneInfo("Asia/Kolkata")


def utc_now() -> datetime:
    return datetime.utcnow()


def as_ist_if_naive(value: datetime | None) -> datetime | None:
    """Attach IST to a naive datetime; leave an already-aware one untouched."""
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=IST)


def datetime_to_iso(value: datetime | None) -> str | None:
    if not value:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc).isoformat()
    return value.astimezone(timezone.utc).isoformat()

