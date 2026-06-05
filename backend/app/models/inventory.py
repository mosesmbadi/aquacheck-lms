import enum
from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, DateTime, Date, Float, ForeignKey, Text,
    Enum as SAEnum,
)
from sqlalchemy.orm import relationship
from app.database import Base


class InventoryCategory(str, enum.Enum):
    reagent = "reagent"
    standard = "standard"
    consumable = "consumable"
    glassware = "glassware"
    media = "media"
    ppe = "ppe"
    other = "other"


class TransactionType(str, enum.Enum):
    receive = "receive"
    use = "use"
    adjust = "adjust"
    dispose = "dispose"
    return_stock = "return_stock"


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    item_code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False, index=True)
    category = Column(
        SAEnum(InventoryCategory), default=InventoryCategory.reagent, nullable=False
    )
    description = Column(Text, nullable=True)
    unit = Column(String, nullable=False)  # mL, g, kg, pcs, box, L
    minimum_stock = Column(Float, nullable=False, default=0.0)
    current_stock = Column(Float, nullable=False, default=0.0)
    supplier = Column(String, nullable=True)
    catalog_number = Column(String, nullable=True)
    storage_location = Column(String, nullable=True)
    storage_conditions = Column(String, nullable=True)
    unit_cost = Column(Float, nullable=True)
    expiry_date = Column(Date, nullable=True)
    is_active = Column(Integer, nullable=False, default=1)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    transactions = relationship(
        "InventoryTransaction",
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="InventoryTransaction.transaction_date.desc()",
    )


class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False, index=True)
    transaction_type = Column(SAEnum(TransactionType), nullable=False)
    quantity = Column(Float, nullable=False)  # signed: +received, -used
    balance_after = Column(Float, nullable=False)  # running balance snapshot
    transaction_date = Column(Date, nullable=False, default=lambda: datetime.now(timezone.utc).date())
    lot_number = Column(String, nullable=True)
    expiry_date = Column(Date, nullable=True)
    supplier = Column(String, nullable=True)
    reference = Column(String, nullable=True)  # PO/invoice #, sample code, test ID
    related_sample_id = Column(Integer, ForeignKey("samples.id"), nullable=True)
    related_test_result_id = Column(Integer, ForeignKey("test_results.id"), nullable=True)
    performed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    item = relationship("InventoryItem", back_populates="transactions")


class TestReagentUsage(Base):
    """Maps a test (catalog item) to the inventory items it consumes per run."""
    __tablename__ = "test_reagent_usage"

    id = Column(Integer, primary_key=True, index=True)
    catalog_item_id = Column(
        Integer, ForeignKey("test_catalog.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    inventory_item_id = Column(
        Integer, ForeignKey("inventory_items.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    quantity_per_test = Column(Float, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    inventory_item = relationship("InventoryItem")
