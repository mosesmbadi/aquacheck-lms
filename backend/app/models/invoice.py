import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Enum as SAEnum, Text, Numeric, ForeignKey, Date, JSON
from sqlalchemy.orm import relationship
from app.database import Base


class InvoiceStatus(str, enum.Enum):
    draft = "draft"
    issued = "issued"
    paid = "paid"
    void = "void"


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String, nullable=False, unique=True, index=True)
    sample_id = Column(Integer, ForeignKey("samples.id"), nullable=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=True)

    # Line items: [{name, quantity, unit_price, total}]
    items = Column(JSON, nullable=False, default=list)

    subtotal = Column(Numeric(14, 2), nullable=False, default=0)
    vat_rate = Column(Numeric(5, 2), nullable=False, default=16)
    vat_amount = Column(Numeric(14, 2), nullable=False, default=0)
    total = Column(Numeric(14, 2), nullable=False, default=0)
    currency = Column(String, nullable=False, default="KES")

    status = Column(SAEnum(InvoiceStatus), nullable=False, default=InvoiceStatus.draft)
    due_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    sample = relationship("Sample", foreign_keys=[sample_id])
    customer = relationship("Customer", foreign_keys=[customer_id])
