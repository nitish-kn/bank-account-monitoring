from ..models.user import User
from sqlalchemy.orm import Session
from ..database import get_db
from fastapi import Depends

async def clean_parsed_rows(user: User, db: Session = Depends(get_db)):
    pass