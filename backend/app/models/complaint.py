import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Enum as SAEnum, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base


class ComplaintStatus(str, enum.Enum):
    received = "received"
    under_investigation = "under_investigation"
    corrective_action = "corrective_action"
    closed = "closed"


class ComplaintCategory(str, enum.Enum):
    complaint = "complaint"
    feedback = "feedback"


class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(Integer, primary_key=True, index=True)
    complaint_number = Column(String, unique=True, index=True, nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=True)
    category = Column(SAEnum(ComplaintCategory), default=ComplaintCategory.complaint, nullable=False)
    description = Column(Text, nullable=False)
    reported_by = Column(String, nullable=True)
    received_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    status = Column(SAEnum(ComplaintStatus), default=ComplaintStatus.received, nullable=False)
    investigation_notes = Column(Text, nullable=True)
    corrective_action = Column(Text, nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    closed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    customer = relationship("Customer", back_populates="complaints")
    contract = relationship("Contract", back_populates="complaints")
    closer = relationship("User", foreign_keys=[closed_by])
