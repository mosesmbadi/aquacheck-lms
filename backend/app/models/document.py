import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Enum as SAEnum, Date, Text, JSON
from app.database import Base


class DocumentCategory(str, enum.Enum):
    sop = "sop"
    masterlist = "masterlist"
    user_guide = "user_guide"
    forms = "forms"
    external_documents = "external_documents"


class DocumentStatus(str, enum.Enum):
    active = "active"
    under_review = "under_review"
    superseded = "superseded"


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=False)
    title = Column(String, nullable=False)
    category = Column(SAEnum(DocumentCategory), nullable=False, index=True)
    version = Column(String, default="1.0", nullable=False)
    status = Column(SAEnum(DocumentStatus), default=DocumentStatus.active, nullable=False)
    effective_date = Column(Date, nullable=True)
    description = Column(Text, nullable=True)
    # List of {"heading": str, "body": str} dicts stored as JSON
    content = Column(JSON, default=list, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
