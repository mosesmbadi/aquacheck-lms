from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from app.database import Base


class ScientificName(Base):
    """
    A scientific (Latin) name the test report prints in italics wherever it appears —
    parameter names and the comments block. Italics belong to the organism, not to a
    test, so one row covers every catalog item that mentions it.

    Store only the part that is italic by convention: "Salmonella", not "Salmonella spp"
    (spp. stays roman). Matching ignores case and treats "E.coli" and "E. coli" alike.
    """

    __tablename__ = "scientific_names"

    id = Column(Integer, primary_key=True, index=True)
    term = Column(String, nullable=False, unique=True, index=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
