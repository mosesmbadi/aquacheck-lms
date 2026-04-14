import enum
from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, DateTime, Enum as SAEnum, Text, Numeric, ForeignKey, Date, JSON
)
from sqlalchemy.orm import relationship
from app.database import Base


class QuotationStatus(str, enum.Enum):
    draft = "draft"
    sent = "sent"
    accepted = "accepted"
    rejected = "rejected"
    expired = "expired"


class Quotation(Base):
    __tablename__ = "quotations"

    id = Column(Integer, primary_key=True, index=True)
    quote_number = Column(String, nullable=False, unique=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)

    # line items: [{catalog_item_id, name, unit, quantity, unit_price, total}]
    items = Column(JSON, nullable=False, default=list)

    subtotal = Column(Numeric(14, 2), nullable=False, default=0)
    vat_rate = Column(Numeric(5, 2), nullable=False, default=0)  # percent
    vat_amount = Column(Numeric(14, 2), nullable=False, default=0)
    total = Column(Numeric(14, 2), nullable=False, default=0)
    currency = Column(String, nullable=False, default="KES")

    status = Column(SAEnum(QuotationStatus), nullable=False, default=QuotationStatus.draft)
    valid_until = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    terms = Column(Text, nullable=True)

    sent_to = Column(String, nullable=True)  # email(s), comma-separated
    sent_at = Column(DateTime(timezone=True), nullable=True)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    customer = relationship("Customer")
    creator = relationship("User", foreign_keys=[created_by])
