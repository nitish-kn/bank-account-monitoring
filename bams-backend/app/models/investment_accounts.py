from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..database import Base
from .types import ID_TYPE


class InvestmentAccount(Base):
    """A demat account or MF folio belonging to a holder (one person) of an org."""

    __tablename__ = "investment_accounts"
    __table_args__ = (
        UniqueConstraint("org_id", "account_key", name="uq_investment_accounts_org_account_key"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    org_id = Column(ID_TYPE, ForeignKey("organizations.id"), nullable=False, index=True)
    holder_name = Column(String, nullable=False, index=True)

    depository = Column(String, nullable=False)  # NSDL | CDSL | MF_FOLIO
    broker_name = Column(String, nullable=False)
    # "DPID/ClientID" for demat accounts (12081601/47275433), "folio/<no>" for MF folios.
    account_key = Column(String, nullable=False)
    nominee_status = Column(String)

    # Kite Connect setup. Only filled on a holder's Zerodha account.
    kite_api_key = Column(String)
    kite_api_secret_encrypted = Column(String)
    kite_user_id = Column(String)
    kite_last_synced_at = Column(DateTime(timezone=True))
    kite_last_sync_status = Column(String)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    holdings = relationship("Holding", back_populates="account", cascade="all, delete-orphan")
