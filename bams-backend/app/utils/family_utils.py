from sqlalchemy.orm import Session

from ..models.family import Family
from ..models.user import User


def ensure_family(current_user: User, db: Session) -> Family:
    if current_user.family_id:
        family = db.query(Family).filter(Family.id == current_user.family_id).first()
        if family:
            return family

    family = Family(
        name=f"{current_user.name or current_user.email}'s Family",
        owner_user_id=current_user.id,
    )
    db.add(family)
    db.flush()

    current_user.family_id = family.id
    db.add(current_user)
    db.flush()

    return family


def move_user_to_family(user: User, family_id: int, db: Session) -> None:
    if user.family_id == family_id:
        return

    previous_family_id = user.family_id

    if previous_family_id:
        previous_family = db.query(Family).filter(Family.id == previous_family_id).first()
        if previous_family and previous_family.owner_user_id == user.id:
            next_owner = (
                db.query(User)
                .filter(
                    User.family_id == previous_family_id,
                    User.id != user.id,
                )
                .order_by(User.created_at.asc(), User.id.asc())
                .first()
            )
            if next_owner:
                previous_family.owner_user_id = next_owner.id
                db.add(previous_family)

    user.family_id = family_id
    db.add(user)

