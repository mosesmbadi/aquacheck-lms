from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, Field
from app.models.inventory import InventoryCategory, TransactionType


# ── InventoryItem ─────────────────────────────────────────────────────────────

class InventoryItemBase(BaseModel):
    item_code: str
    name: str
    category: InventoryCategory = InventoryCategory.reagent
    description: Optional[str] = None
    unit: str
    minimum_stock: float = 0.0
    supplier: Optional[str] = None
    catalog_number: Optional[str] = None
    storage_location: Optional[str] = None
    storage_conditions: Optional[str] = None
    unit_cost: Optional[float] = None
    notes: Optional[str] = None


class InventoryItemCreate(InventoryItemBase):
    opening_stock: float = 0.0  # optional initial stock; creates a seed transaction


class InventoryItemUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[InventoryCategory] = None
    description: Optional[str] = None
    unit: Optional[str] = None
    minimum_stock: Optional[float] = None
    supplier: Optional[str] = None
    catalog_number: Optional[str] = None
    storage_location: Optional[str] = None
    storage_conditions: Optional[str] = None
    unit_cost: Optional[float] = None
    is_active: Optional[int] = None
    notes: Optional[str] = None


class InventoryItemOut(InventoryItemBase):
    id: int
    current_stock: float
    is_active: int
    created_at: datetime
    updated_at: datetime
    is_low_stock: bool = False

    model_config = {"from_attributes": True}


# ── InventoryTransaction ──────────────────────────────────────────────────────

class InventoryTransactionBase(BaseModel):
    item_id: int
    transaction_type: TransactionType
    quantity: float = Field(..., description="Positive number; sign applied by type")
    transaction_date: Optional[date] = None
    lot_number: Optional[str] = None
    expiry_date: Optional[date] = None
    supplier: Optional[str] = None
    reference: Optional[str] = None
    related_sample_id: Optional[int] = None
    related_test_result_id: Optional[int] = None
    notes: Optional[str] = None


class InventoryTransactionCreate(InventoryTransactionBase):
    pass


class InventoryTransactionOut(InventoryTransactionBase):
    id: int
    balance_after: float
    performed_by: Optional[int]
    created_at: datetime
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    item_unit: Optional[str] = None

    model_config = {"from_attributes": True}


class InventoryStats(BaseModel):
    total_items: int
    low_stock_count: int
    expiring_soon_count: int
    total_value: float


# ── TestReagentUsage ──────────────────────────────────────────────────────────

class TestReagentUsageBase(BaseModel):
    catalog_item_id: int
    inventory_item_id: int
    quantity_per_test: float = Field(..., gt=0)
    notes: Optional[str] = None


class TestReagentUsageCreate(TestReagentUsageBase):
    pass


class TestReagentUsageOut(TestReagentUsageBase):
    id: int
    created_at: datetime
    # Denormalized for easy UI display
    catalog_item_name: Optional[str] = None
    inventory_item_name: Optional[str] = None
    inventory_item_code: Optional[str] = None
    inventory_unit: Optional[str] = None
    current_stock: Optional[float] = None

    model_config = {"from_attributes": True}


# ── CSV import ────────────────────────────────────────────────────────────────

class CsvImportResult(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: List[str] = []
