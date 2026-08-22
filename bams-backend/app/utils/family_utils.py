from sqlalchemy.orm import Session

from ..models.family import Family
from ..models.organization import Organization


def ensure_family(current_org: Organization, db: Session) -> Family:
    if current_org.family_id:
        family = db.query(Family).filter(Family.id == current_org.family_id).first()
        if family:
            return family

    family = Family(
        name=f"{current_org.name or current_org.email}'s Family",
        owner_org_id=current_org.id,
    )
    db.add(family)
    db.flush()

    current_org.family_id = family.id
    db.add(current_org)
    db.flush()

    return family


def move_org_to_family(org: Organization, family_id: int, db: Session) -> None:
    if org.family_id == family_id:
        return

    previous_family_id = org.family_id

    if previous_family_id:
        previous_family = db.query(Family).filter(Family.id == previous_family_id).first()
        if previous_family and previous_family.owner_org_id == org.id:
            next_owner = (
                db.query(Organization)
                .filter(
                    Organization.family_id == previous_family_id,
                    Organization.id != org.id,
                )
                .order_by(Organization.created_at.asc(), Organization.id.asc())
                .first()
            )
            if next_owner:
                previous_family.owner_org_id = next_owner.id
                db.add(previous_family)

    org.family_id = family_id
    db.add(org)

