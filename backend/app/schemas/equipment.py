from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel
from app.models.equipment import EquipmentStatus


class EquipmentBase(BaseModel):
    equipment_id: str
    name: str
    model: Optional[str] = None
    manufacturer: Optional[str] = None
    serial_number: Optional[str] = None
    location: Optional[str] = None
    calibration_due_date: Optional[date] = None
    last_calibration_date: Optional[date] = None
    calibration_certificate_ref: Optional[str] = None
    is_active: bool = True


class EquipmentCreate(EquipmentBase):
    pass


class EquipmentUpdate(BaseModel):
    name: Optional[str] = None
    model: Optional[str] = None
    manufacturer: Optional[str] = None
    serial_number: Optional[str] = None
    status: Optional[EquipmentStatus] = None
    location: Optional[str] = None
    calibration_due_date: Optional[date] = None
    last_calibration_date: Optional[date] = None
    calibration_certificate_ref: Optional[str] = None
    is_active: Optional[bool] = None


class EquipmentOut(EquipmentBase):
    id: int
    status: EquipmentStatus
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
