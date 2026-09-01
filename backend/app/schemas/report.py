from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
from app.models.report import ReportType, ReportStatus


class ReportBase(BaseModel):
    contract_id: Optional[int] = None
    report_type: ReportType = ReportType.test_report
    content: Optional[Dict[str, Any]] = {}


class ReportCreate(ReportBase):
    pass


class ReportUpdate(BaseModel):
    content: Optional[Dict[str, Any]] = None
    status: Optional[ReportStatus] = None
    amendment_reason: Optional[str] = None  # required when editing an issued report


class ReportOut(ReportBase):
    id: int
    report_number: str
    status: ReportStatus
    issued_by: Optional[int] = None
    issued_at: Optional[datetime] = None
    pdf_path: Optional[str] = None
    digital_signature: Optional[str] = None
    public_token: Optional[str] = None
    revision_history: Optional[List[Any]] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
