from uuid import uuid4

from sqlalchemy import Column, Date, DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..database import Base


class Holding(Base):
    """What an account held on `as_of_date`.

    Each CAS upload or Kite sync saves the full list for that date (unchanged holdings are
    copied over with the new date). A stock that is no longer held is simply absent.
    The page reads the rows of the newest as_of_date per account.
    """

    __tablename__ = "holdings"
    __table_args__ = (
        UniqueConstraint("account_id", "isin", "as_of_date", "source", name="uq_holdings_account_isin_date_source"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    account_id = Column(String, ForeignKey("investment_accounts.id", ondelete="CASCADE"), nullable=False)
    as_of_date = Column(Date, nullable=False)

    isin = Column(String, nullable=False)
    symbol = Column(String)  # e.g. DEN.NSE, used for live price lookups
    name = Column(String)
    investment_type = Column(String, nullable=False)  # equity | mutual_fund | bond | mf_folio

    quantity = Column(Numeric(18, 3), nullable=False)  # shares or units
    price_on_date = Column(Numeric(14, 4))  # price/NAV of one unit on as_of_date, the fallback if no live price
    cost_per_quantity = Column(Numeric(14, 4))  # what one unit cost you; empty when unknown
    note = Column(String)

    source = Column(String, nullable=False)  # cas | kite | manual

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    account = relationship("InvestmentAccount", back_populates="holdings")
