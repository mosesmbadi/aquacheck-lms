import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Enum as SAEnum, JSON, Boolean, Float
from app.database import Base


class QualifierKind(str, enum.Enum):
    """
    qualifier    — a non-numeric token an analyst can type into a result box (ND, TNTC,
                   Detected…). Participates in compliance evaluation.
    abbreviation — legend-only shorthand printed under the results table (KS, CFU, NEMA…).
                   Never matched against result values.
    """
    qualifier = "qualifier"
    abbreviation = "abbreviation"


class LegendScope(str, enum.Enum):
    """Which report flavour the legend entry is printed on."""
    all = "all"
    waste = "waste"
    non_waste = "non_waste"


class ResultQualifier(Base):
    """
    Lab vocabulary for non-numeric results and report legend abbreviations.

    These used to be hardcoded in the frontend compliance helper and in the printed
    legend, which meant the lab could not teach the system a new token (e.g. TNTC)
    without a code change. Seeded with sensible defaults on startup and editable by
    admins/managers from the Test Catalog area.

    Compliance semantics of a `qualifier` row are expressed by three fields:
      numeric_equivalent — the number the token stands for, if any (ND → 0).
      exceeds_limit      — the token is above *any* finite limit (TNTC).
      is_detected        — the analyte was present (Detected, TNTC). Drives evaluation
                           against qualitative limits such as "Not Detectable" / "Nil".
    """

    __tablename__ = "result_qualifiers"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, nullable=False, index=True)
    label = Column(String, nullable=False)
    kind = Column(SAEnum(QualifierKind), nullable=False, default=QualifierKind.qualifier, index=True)
    # Extra spellings matched case-insensitively against a typed result or standard limit.
    aliases = Column(JSON, default=list)
    numeric_equivalent = Column(Float, nullable=True)
    exceeds_limit = Column(Boolean, nullable=False, default=False)
    is_detected = Column(Boolean, nullable=False, default=False)
    legend_scope = Column(SAEnum(LegendScope), nullable=False, default=LegendScope.all)
    show_in_legend = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
