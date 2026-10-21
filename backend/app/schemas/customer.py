from datetime import datetime
from typing import Optional
import re
from pydantic import BaseModel, EmailStr, field_validator


def _validate_currency(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    v = v.strip().upper()
    if not v:
        return "KES"
    if not re.fullmatch(r"[A-Z]{3}", v):
        raise ValueError("Currency must be a 3-letter code, e.g. KES or USD")
    return v


class CustomerBase(BaseModel):
    name: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    organization_type: Optional[str] = None
    currency: Optional[str] = "KES"
    report_show_who: bool = False
    report_hide_remarks: bool = False
    is_active: bool = True


# Validate on input only — CustomerOut must still serialise legacy free-text values.
class CustomerCreate(CustomerBase):
    _currency = field_validator("currency")(_validate_currency)


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    organization_type: Optional[str] = None
    currency: Optional[str] = None
    report_show_who: Optional[bool] = None
    report_hide_remarks: Optional[bool] = None
    is_active: Optional[bool] = None

    _currency = field_validator("currency")(_validate_currency)


class CustomerOut(CustomerBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}
