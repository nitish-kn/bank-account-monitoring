from datetime import datetime, timezone


def utc_now() -> datetime:
    return datetime.utcnow()


def datetime_to_iso(value: datetime | None) -> str | None:
    if not value:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc).isoformat()
    return value.astimezone(timezone.utc).isoformat()

