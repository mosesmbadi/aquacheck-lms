import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Enum as SAEnum, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
from app.database import Base


class ReportType(str, enum.Enum):
    test_report = "test_report"
    calibration_certificate = "calibration_certificate"
    sampling_report = "sampling_report"
    conformity_statement = "conformity_statement"


class ReportStatus(str, enum.Enum):
    draft = "draft"
    under_review = "under_review"
    issued = "issued"
    amended = "amended"


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    report_number = Column(String, unique=True, index=True, nullable=False)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=True)
    report_type = Column(SAEnum(ReportType), default=ReportType.test_report, nullable=False)
    status = Column(SAEnum(ReportStatus), default=ReportStatus.draft, nullable=False)
    content = Column(JSON, default=dict)
    issued_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    issued_at = Column(DateTime(timezone=True), nullable=True)
    pdf_path = Column(String, nullable=True)
    digital_signature = Column(String, nullable=True)
    public_token = Column(String, unique=True, nullable=True, default=lambda: str(uuid.uuid4()))
    revision_history = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    contract = relationship("Contract", back_populates="reports")
    issuer = relationship("User", foreign_keys=[issued_by])
