from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base
from .types import ID_TYPE

class UserSheet(Base):
    __tablename__ = "user_sheets"

    id = Column(ID_TYPE, primary_key=True)
    user_id = Column(ID_TYPE, ForeignKey("users.id"))
    sheet_id = Column(String, unique=True, index=True)
    title = Column(String)

    user = relationship("User")
