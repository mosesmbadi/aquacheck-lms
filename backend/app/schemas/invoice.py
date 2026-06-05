from datetime import datetime, date
from typing import Optional, List, Any
from pydantic import BaseModel
from app.models.invoice import InvoiceStatus


class InvoiceItemSchema(BaseModel):
    name: str
    quantity: float = 1
    unit_price: float = 0
    total: float = 0


class InvoiceCreate(BaseModel):
    sample_id: Optional[int] = None
    customer_id: Optional[int] = None
    contract_id: Optional[int] = None
    items: List[Any] = []
    vat_rate: float = 16
    currency: str = "KES"
    due_date: Optional[date] = None
    notes: Optional[str] = None


class InvoiceUpdate(BaseModel):
    items: Optional[List[Any]] = None
    vat_rate: Optional[float] = None
    currency: Optional[str] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None
    status: Optional[InvoiceStatus] = None


class InvoiceOut(BaseModel):
    id: int
    invoice_number: str
    sample_id: Optional[int] = None
    customer_id: Optional[int] = None
    contract_id: Optional[int] = None
    items: List[Any] = []
    subtotal: float
    vat_rate: float
    vat_amount: float
    total: float
    currency: str
    status: InvoiceStatus
    due_date: Optional[date] = None
    notes: Optional[str] = None
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    customer_name: Optional[str] = None
    sample_code: Optional[str] = None

    model_config = {"from_attributes": True}
