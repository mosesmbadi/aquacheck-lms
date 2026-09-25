import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Enum as SAEnum, Text, Boolean, Numeric
from app.database import Base


class TestCategory(str, enum.Enum):
    physicochemical = "physicochemical"
    microbiological = "microbiological"


class RemarkRule(str, enum.Enum):
    """How the REMARKS column is filled for a test."""
    #: Compared against standard_limit → COMPLIANT / NON-COMPLIANT (the default).
    compliance = "compliance"
    #: Colony count → contamination rating (ASTM D5588): No / Trace / Light / Moderate / Heavy.
    contamination_rating = "contamination_rating"
    #: Entered by the analyst with the result (e.g. "Resistant" for ASTM D4300).
    manual = "manual"


class TestCatalogItem(Base):
    __tablename__ = "test_catalog"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    category = Column(SAEnum(TestCategory), nullable=False, index=True)
    water_type = Column(String, nullable=False, default="dialysis_potable", index=True)
    unit = Column(String, nullable=True)
    method_name = Column(String, nullable=True)
    standard_limit = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    price = Column(Numeric(12, 2), nullable=False, default=0)
    sort_order = Column(Integer, default=0)
    # Report section heading, when it isn't the category's ("SUSCEPTIBILITY TEST").
    section = Column(String, nullable=True)
    # RemarkRule value, stored as plain text; NULL means RemarkRule.compliance.
    remark_rule = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
