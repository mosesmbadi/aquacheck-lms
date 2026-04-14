import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Enum as SAEnum, Text, Boolean, Numeric
from app.database import Base


class TestCategory(str, enum.Enum):
    physicochemical = "physicochemical"
    microbiological = "microbiological"


class TestCatalogItem(Base):
    __tablename__ = "test_catalog"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    category = Column(SAEnum(TestCategory), nullable=False, index=True)
    unit = Column(String, nullable=True)
    method_name = Column(String, nullable=True)
    standard_limit = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    price = Column(Numeric(12, 2), nullable=False, default=0)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
