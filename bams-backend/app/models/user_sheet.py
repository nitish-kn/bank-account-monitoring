from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base

class UserSheet(Base):
    __tablename__ = "user_sheets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    sheet_id = Column(String, unique=True, index=True)
    title = Column(String)

    user = relationship("User")