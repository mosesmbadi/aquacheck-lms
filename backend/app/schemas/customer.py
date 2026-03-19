from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr


class CustomerBase(BaseModel):
    name: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    organization_type: Optional[str] = None
    currency: Optional[str] = "KES"
    is_active: bool = True


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    organization_type: Optional[str] = None
    currency: Optional[str] = None
    is_active: Optional[bool] = None


class CustomerOut(CustomerBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}
