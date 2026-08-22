from fastapi.security import OAuth2PasswordBearer
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.organization import Organization
from .auth import verify_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def get_current_org(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = verify_token(token)
    if payload is None:
        raise credentials_exception
    org_id: str = payload.get("sub")
    if org_id is None:
        raise credentials_exception
    org = db.query(Organization).filter(Organization.id == int(org_id)).first()
    if org is None:
        raise credentials_exception
    return org
