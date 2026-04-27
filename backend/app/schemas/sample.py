from datetime import datetime, date
from typing import Optional, List, Any
from pydantic import BaseModel, Field, field_validator
from app.models.sample import SampleStatus, SampleCategory


class SampleBase(BaseModel):
    customer_id: Optional[int] = None
    contract_id: Optional[int] = Field(None, gt=0)
    description: Optional[str] = None
    sample_type: Optional[str] = None
    sample_category: Optional[SampleCategory] = None
    waste_schedule: Optional[int] = None
    collection_date: Optional[date] = None
    collection_location: Optional[str] = None
    gps_coordinates: Optional[str] = None
    storage_condition: Optional[str] = None
    requested_test_ids: Optional[List[int]] = Field(default_factory=list)

    @field_validator("contract_id", mode="before")
    @classmethod
    def normalize_contract_id(cls, value):
        if value in ("", 0, "0"):
            return None
        return value


class SampleCreate(SampleBase):
    pass


class SampleUpdate(BaseModel):
    contract_id: Optional[int] = Field(None, gt=0)
    description: Optional[str] = None
    sample_type: Optional[str] = None
    sample_category: Optional[SampleCategory] = None
    waste_schedule: Optional[int] = None
    collection_date: Optional[date] = None
    collection_location: Optional[str] = None
    gps_coordinates: Optional[str] = None
    storage_condition: Optional[str] = None
    status: Optional[SampleStatus] = None
    disposal_date: Optional[date] = None
    disposal_method: Optional[str] = None
    requested_test_ids: Optional[List[int]] = None

    @field_validator("contract_id", mode="before")
    @classmethod
    def normalize_contract_id(cls, value):
        if value in ("", 0, "0"):
            return None
        return value


class CustodyEntry(BaseModel):
    action: str


class SampleOut(SampleBase):
    id: int
    sample_code: str
    received_by: Optional[int] = None
    received_at: datetime
    status: SampleStatus
    barcode_data: Optional[str] = None
    disposal_date: Optional[date] = None
    disposal_method: Optional[str] = None
    chain_of_custody: Optional[List[Any]] = []
    requested_test_ids: Optional[List[int]] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
