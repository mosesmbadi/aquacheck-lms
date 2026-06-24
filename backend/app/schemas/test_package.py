from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


class TestPackageItemOut(BaseModel):
    id: int
    catalog_item_id: int
    catalog_item_name: Optional[str] = None
    catalog_item_category: Optional[str] = None

    model_config = {"from_attributes": True}


class TestPackageCreate(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    catalog_item_ids: List[int]


class TestPackageUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    catalog_item_ids: Optional[List[int]] = None
    is_active: Optional[bool] = None


class TestPackageOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    price: float
    is_active: bool
    items: List[TestPackageItemOut] = []
    # convenience: list of catalog_item_ids so frontend can quickly read membership
    catalog_item_ids: List[int] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
