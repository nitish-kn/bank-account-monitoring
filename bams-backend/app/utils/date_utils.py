from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

# Bank statements/emails report transaction timestamps in India Standard
# Time with no offset in the raw text (e.g. "29-Aug-2026 17:54:21"). A naive
# datetime built from that text must be tagged with *this*, not left naive --
# a naive value handed to a `timestamptz` column gets tagged with whatever
# timezone the connecting Postgres session happens to default to, which is
# why the same value showed up as +05:30 locally and +00 on the server.
IST = ZoneInfo("Asia/Kolkata")


def utc_now() -> datetime:
    """Timezone-aware UTC now. Aware on purpose: a naive value written to a
    `timestamptz` column is interpreted in the connecting session's timezone
    (now IST -- see database.py), which would shift it by 5h30m."""
    return datetime.now(timezone.utc)


def ist_now() -> datetime:
    return datetime.now(IST)


def ist_today() -> date:
    """Today in IST -- the day the user means, whatever timezone the server
    process happens to run in (UTC in production)."""
    return datetime.now(IST).date()


def to_ist(value: datetime | None) -> datetime | None:
    """Same instant, expressed in IST. A naive value is assumed to be IST."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=IST)
    return value.astimezone(IST)


def ist_day(value: datetime | None) -> date | None:
    """The calendar day a timestamp falls on in IST.

    Transaction dates are stored as IST midnight, i.e. 18:30Z the day before.
    Calling .date() on one straight from the driver returns the previous day
    whenever the session runs in UTC, which is why this is never done inline.
    """
    ist_value = to_ist(value)
    return ist_value.date() if ist_value else None


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

