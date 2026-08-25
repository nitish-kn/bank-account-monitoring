"""
Backfill: give every existing Organization a super_admin role and a matching
User row.

Organizations created before roles/users existed have neither -- this brings
them in line with what a fresh Google signup now provisions automatically.
The actual work lives in rbac_service.ensure_super_admin, so signup and this
script can't drift apart; this file just walks every org and calls it.

Safe to re-run: orgs that already have both are left alone, and the
super_admin role's permission set is re-synced each run, so a permission
added to the catalog later reaches every org without a second backfill.

Run `seed_permissions.py` first -- this needs the catalog populated.

Usage (from bams-backend/):
    .venv/Scripts/python -m app.scripts.backfill_org_super_admins
"""

from fastapi import HTTPException

from ..database import SessionLocal
from ..models.organization import Organization
from ..models.permission import Permission
from ..services.rbac_service import ensure_super_admin


def backfill_super_admins() -> None:
    db = SessionLocal()
    try:
        if not db.query(Permission).count():
            print("No rows in `permissions` yet -- run seed_permissions first, then this.")
            return

        orgs = db.query(Organization).all()
        processed = 0
        skipped = 0

        for org in orgs:
            if not org.email:
                print(f"  WARNING: organization id={org.id} has no email -- skipping.")
                skipped += 1
                continue
            try:
                ensure_super_admin(db, org)
            except HTTPException as err:
                # One org's email collision shouldn't abort everyone else's backfill.
                print(f"  WARNING: organization id={org.id} ({org.email}): {err.detail} -- skipping.")
                skipped += 1
                continue
            processed += 1

        db.commit()
        print(f"Processed {processed} organizations ({skipped} skipped).")
    finally:
        db.close()


if __name__ == "__main__":
    backfill_super_admins()
