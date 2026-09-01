from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.deps import get_optional_current_user
from app.models.report import Report, ReportStatus
from app.models.contract import Contract
from app.models.customer import Customer
from app.models.sample import Sample
from app.models.test_result import TestResult
from app.models.user import User, UserRole
from app.routers.reports import _result_sections

router = APIRouter(prefix="/public", tags=["Public"])


@router.get("/reports/{token}")
def get_public_report(
    token: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """QR-code landing endpoint for a report.

    - No/invalid auth: returns report metadata and parameter list, but NOT
      test result values.
    - Authenticated as an admin/staff user, or as the customer user tied to
      this report's lab account: returns the full report including results.
    """
    report = db.query(Report).filter(Report.public_token == token).first()
    if not report or report.status not in (ReportStatus.issued, ReportStatus.amended):
        raise HTTPException(status_code=404, detail="Report not found or not yet issued.")

    contract = db.query(Contract).filter(Contract.id == report.contract_id).first() if report.contract_id else None
    resolved_customer_id = report.customer_id or (contract.customer_id if contract else None)
    customer = db.query(Customer).filter(Customer.id == resolved_customer_id).first() if resolved_customer_id else None
    content = report.content or {}
    sample_id = content.get("sample_id")
    sample = db.query(Sample).filter(Sample.id == sample_id).first() if sample_id else None

    is_authorized = bool(
        current_user
        and (
            current_user.role != UserRole.customer
            or (current_user.customer_id and current_user.customer_id == resolved_customer_id)
        )
    )

    if is_authorized:
        test_results = (
            db.query(TestResult).filter(TestResult.sample_id == sample.id).order_by(TestResult.created_at.asc()).all()
            if sample
            else []
        )
        result_sections = _result_sections(test_results, content, sample)
        parameters = [
            {
                "parameter": row.get("parameter", "—"),
                "method": row.get("method", "—"),
                "result": row.get("result", "—"),
                "specification": row.get("specification", "—"),
                "remarks": row.get("remarks", "—"),
                "section": section.get("title", ""),
            }
            for section in result_sections
            for row in section.get("rows", [])
        ]
        note = "Verified access — full report shown."
    else:
        result_sections = content.get("result_sections") or []
        parameters = [
            {
                "parameter": row.get("parameter", "—"),
                "method": row.get("method", "—"),
                "section": section.get("title", ""),
            }
            for section in result_sections
            for row in section.get("rows", [])
        ]
        note = "Results are confidential and only visible to authorized users. Log in to view the full report."

    return {
        "report_number": report.report_number,
        "report_type": report.report_type.value,
        "status": report.status.value,
        "issued_at": report.issued_at.isoformat() if report.issued_at else None,
        "client_name": customer.name if customer else content.get("submitted_by", "—"),
        "sample_description": (sample.description if sample else None) or content.get("sample_description", "—"),
        "sampling_location": content.get("sampling_location", sample.collection_location if sample else "—"),
        "sampling_date": content.get("sampling_date", str(sample.collection_date) if sample and sample.collection_date else "—"),
        "sampled_by": content.get("sampled_by", "AQUACHECK LABORATORIES LTD"),
        "parameters": parameters,
        "authorized": is_authorized,
        "laboratory": "AquaCheck Laboratories Limited",
        "note": note,
    }
