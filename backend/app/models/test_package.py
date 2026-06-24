from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Numeric
from sqlalchemy.orm import relationship
from app.database import Base


class TestPackage(Base):
    __tablename__ = "test_packages"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    description = Column(Text, nullable=True)
    price = Column(Numeric(12, 2), nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    items = relationship("TestPackageItem", back_populates="package", cascade="all, delete-orphan")


class TestPackageItem(Base):
    __tablename__ = "test_package_items"

    id = Column(Integer, primary_key=True, index=True)
    package_id = Column(Integer, ForeignKey("test_packages.id", ondelete="CASCADE"), nullable=False, index=True)
    # ForeignKey here is Python/ORM-only metadata — SQLAlchemy needs it to resolve
    # the relationship join condition. The actual DB-level constraint is intentionally
    # omitted from the Alembic migration (004) because test_catalog is created by
    # Base.metadata.create_all() after migrations run, so the constraint would fail
    # on a fresh database. Since create_all() skips tables that already exist,
    # no constraint is ever emitted to Postgres.
    catalog_item_id = Column(Integer, ForeignKey("test_catalog.id"), nullable=False, index=True)

    package = relationship("TestPackage", back_populates="items")
    catalog_item = relationship("TestCatalogItem")
