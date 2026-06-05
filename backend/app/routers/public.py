from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.report import Report, ReportStatus
from app.models.contract import Contract
from app.models.customer import Customer
from app.models.sample import Sample

router = APIRouter(prefix="/public", tags=["Public"])


@router.get("/reports/{token}")
def get_public_report(token: str, db: Session = Depends(get_db)):
    """Public endpoint — no auth required. Returns report metadata and parameter list
    but NOT test result values. Used by QR code scans."""
    report = db.query(Report).filter(Report.public_token == token).first()
    if not report or report.status not in (ReportStatus.issued, ReportStatus.amended):
        raise HTTPException(status_code=404, detail="Report not found or not yet issued.")

    contract = db.query(Contract).filter(Contract.id == report.contract_id).first()
    customer = db.query(Customer).filter(Customer.id == contract.customer_id).first() if contract else None
    content = report.content or {}
    sample_id = content.get("sample_id")
    sample = db.query(Sample).filter(Sample.id == sample_id).first() if sample_id else None

    # Build parameter list (names only — no result values)
    result_sections = content.get("result_sections") or []
    parameters = []
    for section in result_sections:
        for row in section.get("rows", []):
            parameters.append({
                "parameter": row.get("parameter", "—"),
                "method": row.get("method", "—"),
                "section": section.get("title", ""),
            })

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
        "laboratory": "AquaCheck Laboratories Limited",
        "note": "Results are confidential and only visible to authorized users. Scan this QR code and log in to view the full report.",
    }
