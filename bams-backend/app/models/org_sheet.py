from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base
from .types import ID_TYPE

class OrgSheet(Base):
    __tablename__ = "org_sheets"

    id = Column(ID_TYPE, primary_key=True)
    org_id = Column(ID_TYPE, ForeignKey("organizations.id"))
    sheet_id = Column(String, unique=True, index=True)
    title = Column(String)

    org = relationship("Organization")
