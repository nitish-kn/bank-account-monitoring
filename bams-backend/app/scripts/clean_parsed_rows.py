import logging
from datetime import timedelta, timezone

from ..database import SessionLocal
from ..models.parsed import Parsed
from ..models.organization import Organization

logger = logging.getLogger(__name__)

RETENTION_DAYS = 2


def clean_parsed_rows() -> None:
    """Delete `parsed` rows older than RETENTION_DAYS before each org's last sync.

    Runs nightly via the scheduler (see scheduler.py). Each org is committed
    independently so one org's failure doesn't roll back everyone else's cleanup.
    """
    db = SessionLocal()
    try:
        org_last_synced = dict(db.query(Organization.id, Organization.last_synced_at).all())

        cleaned_orgs = 0
        for org_id, last_synced_at in org_last_synced.items():
            if not last_synced_at:
                continue

            # `last_synced_at` is stored as a naive-but-UTC datetime (see
            # utc_now()), while `Parsed.created_at` is timezone-aware --
            # attach UTC explicitly so the comparison below is unambiguous
            # regardless of the DB session's timezone setting.
            last_synced_utc = last_synced_at.replace(tzinfo=timezone.utc)
            cutoff_date = last_synced_utc - timedelta(days=RETENTION_DAYS)

            try:
                deleted = (
                    db.query(Parsed)
                    .filter(Parsed.org_id == org_id, Parsed.created_at < cutoff_date)
                    .delete(synchronize_session=False)
                )
                db.commit()
            except Exception as error:
                db.rollback()
                logger.error(
                    "Failed to clean parsed rows | org=%s error=%s", org_id, error,
                )
                continue

            if deleted:
                cleaned_orgs += 1
                logger.info(
                    "Parsed rows cleaned | org=%s cutoff=%s rows_deleted=%d",
                    org_id, cutoff_date.isoformat(), deleted,
                )

        logger.info("Parsed row cleanup finished | orgs_cleaned=%d", cleaned_orgs)

    except Exception as error:
        logger.error("Parsed row cleanup failed | error=%s", error)
    finally:
        db.close()
