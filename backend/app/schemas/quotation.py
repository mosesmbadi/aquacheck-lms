from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, Field
from app.models.quotation import QuotationStatus


class QuotationItem(BaseModel):
    catalog_item_id: Optional[int] = None
    name: str
    unit: Optional[str] = None
    quantity: float = 1
    unit_price: float = 0
    total: float = 0


class QuotationBase(BaseModel):
    customer_id: int
    items: List[QuotationItem] = Field(default_factory=list)
    vat_rate: Optional[float] = None  # falls back to env default
    currency: Optional[str] = None
    valid_until: Optional[date] = None
    notes: Optional[str] = None
    terms: Optional[str] = None


class QuotationCreate(QuotationBase):
    pass


class QuotationUpdate(BaseModel):
    items: Optional[List[QuotationItem]] = None
    vat_rate: Optional[float] = None
    currency: Optional[str] = None
    valid_until: Optional[date] = None
    notes: Optional[str] = None
    terms: Optional[str] = None
    status: Optional[QuotationStatus] = None


class QuotationSendRequest(BaseModel):
    to: Optional[List[str]] = None  # defaults to customer.email
    subject: Optional[str] = None
    message: Optional[str] = None


class QuotationOut(BaseModel):
    id: int
    quote_number: str
    customer_id: int
    customer_name: Optional[str] = None
    items: List[QuotationItem]
    subtotal: float
    vat_rate: float
    vat_amount: float
    total: float
    currency: str
    status: QuotationStatus
    valid_until: Optional[date] = None
    notes: Optional[str] = None
    terms: Optional[str] = None
    sent_to: Optional[str] = None
    sent_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
