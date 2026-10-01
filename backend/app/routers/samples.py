from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import Integer, cast, func, or_, text
from sqlalchemy.orm import Session
from app.config import settings
from app.deps import get_db, get_current_user
from app.models.user import User, UserRole
from app.models.contract import Contract
from app.models.customer import Customer
from app.models.sample import Sample
from app.schemas.sample import SampleCreate, SampleUpdate, SampleOut, CustodyEntry
from app.services.access import ensure_can_view_sample, ensure_staff, is_customer
from app.services.audit import log_action
from app.services.barcode import generate_barcode

router = APIRouter(prefix="/samples", tags=["Samples"])

_DISCHARGE_TO_SCHEDULE = {"environment": 3, "public_sewer": 5}


def _apply_discharge_schedule(data: dict) -> None:
    dest = data.get("discharge_destination")
    if dest and data.get("waste_schedule") is None:
        data["waste_schedule"] = _DISCHARGE_TO_SCHEDULE.get(dest)


# Key for the transaction-level advisory lock that serialises sample numbering.
_SAMPLE_CODE_LOCK_KEY = 710_001


def _next_sample_code(db: Session) -> str:
    """QT/{seq}/{year}. The sequence runs on across years — QT/165/2026 is followed by
    QT/166/2027 — and starts after settings.SAMPLE_CODE_START_AFTER, the last number
    the paper register issued before the LIMS took over.

    Takes a lock held until the caller's transaction ends, so two samples registered
    at the same moment can't both be given the same number."""
    db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _SAMPLE_CODE_LOCK_KEY})
    year = datetime.now(timezone.utc).year
    max_seq = (
        db.query(func.max(cast(func.split_part(Sample.sample_code, "/", 2), Integer)))
        .filter(Sample.sample_code.op("~")(r"^QT/[0-9]+/[0-9]+$"))
        .scalar()
    ) or 0
    return f"QT/{max(max_seq, settings.SAMPLE_CODE_START_AFTER) + 1}/{year}"


def _clean_subcontracted(data: dict, sample: Sample | None = None) -> None:
    """Keep subcontracted_test_ids a subset of the requested tests (a sample with no
    requested tests shows the whole catalog, so any test may be marked)."""
    if "subcontracted_test_ids" not in data and "requested_test_ids" not in data:
        return
    subcontracted = data.get("subcontracted_test_ids")
    if subcontracted is None:
        subcontracted = (sample.subcontracted_test_ids if sample else None) or []
    requested = data.get("requested_test_ids")
    if requested is None:
        requested = (sample.requested_test_ids if sample else None) or []
    if requested:
        subcontracted = [tid for tid in subcontracted if tid in requested]
    data["subcontracted_test_ids"] = list(dict.fromkeys(subcontracted))
    if not data["subcontracted_test_ids"]:
        data["subcontractor_name"] = None
    elif isinstance(data.get("subcontractor_name"), str):
        data["subcontractor_name"] = data["subcontractor_name"].strip() or None


def _clean_accredited(data: dict, sample: Sample | None = None) -> None:
    """Keep accredited_test_ids a subset of the requested tests. None means "follow the
    catalog" and is left alone, unless the requested tests change on a sample that
    already has its own list."""
    if "accredited_test_ids" not in data and "requested_test_ids" not in data:
        return
    accredited = data.get("accredited_test_ids")
    if accredited is None:
        accredited = sample.accredited_test_ids if sample else None
    if accredited is None:
        data.pop("accredited_test_ids", None)
        return
    requested = data.get("requested_test_ids")
    if requested is None:
        requested = (sample.requested_test_ids if sample else None) or []
    if requested:
        accredited = [tid for tid in accredited if tid in requested]
    data["accredited_test_ids"] = list(dict.fromkeys(accredited))


@router.get("", response_model=List[SampleOut])
def list_samples(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if is_customer(current_user):
        cid = current_user.customer_id
        if not cid:
            return []
        contract_alias = db.query(Contract.id).filter(Contract.customer_id == cid).subquery()
        q = db.query(Sample).filter(
            or_(
                Sample.customer_id == cid,
                Sample.contract_id.in_(contract_alias),
            )
        )
    else:
        q = db.query(Sample)
    return q.order_by(Sample.created_at.desc()).all()


@router.post("", response_model=SampleOut, status_code=status.HTTP_201_CREATED)
def create_sample(
    payload: SampleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sample_data = payload.model_dump()
    _apply_discharge_schedule(sample_data)
    _clean_subcontracted(sample_data)
    _clean_accredited(sample_data)
    if is_customer(current_user):
        # A customer registers samples only for their own company.
        if not current_user.customer_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is not linked to a customer.")
        sample_data["customer_id"] = current_user.customer_id
        # Accreditation and subcontracting are the lab's calls: the catalog decides
        # until staff change them.
        sample_data.pop("accredited_test_ids", None)
        sample_data["subcontracted_test_ids"] = []
        sample_data["subcontractor_name"] = None
    if payload.contract_id is not None:
        contract = db.query(Contract).filter(Contract.id == payload.contract_id).first()
        if not contract or (is_customer(current_user) and contract.customer_id != current_user.customer_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")

    sample_code = _next_sample_code(db)
    barcode = generate_barcode(sample_code)
    sample = Sample(
        **sample_data,
        sample_code=sample_code,
        received_by=current_user.id,
        barcode_data=barcode,
        chain_of_custody=[
            {
                "user_id": current_user.id,
                "action": "Sample received",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        ],
    )
    db.add(sample)
    db.flush()  # get sample.id without committing

    # Auto-generate a draft invoice for this sample
    try:
        from app.models.invoice import Invoice
        from app.routers.invoices import _next_invoice_number

        # Determine customer_id from contract or direct assignment
        cust_id = sample.customer_id
        if not cust_id and payload.contract_id:
            c = db.query(Contract).filter(Contract.id == payload.contract_id).first()
            cust_id = c.customer_id if c else None

        # Build a placeholder description item
        inv_items = [{
            "name": f"Analysis of sample: {sample_code}",
            "quantity": 1,
            "unit_price": 0,
            "total": 0,
        }]
        # Determine VAT rate from customer preference (fallback to 16%)
        vat_rate = 16
        if cust_id:
            cust = db.query(Customer).filter(Customer.id == cust_id).first()
            currency = (cust.currency if cust else None) or "KES"
        else:
            currency = "KES"

        invoice = Invoice(
            invoice_number=_next_invoice_number(db),
            sample_id=sample.id,
            customer_id=cust_id,
            contract_id=payload.contract_id,
            items=inv_items,
            subtotal=0,
            vat_rate=vat_rate,
            vat_amount=0,
            total=0,
            currency=currency,
            created_by=current_user.id,
        )
        db.add(invoice)
    except Exception as exc:
        # Invoice creation is non-critical — log and continue
        print(f"[LIMS] Warning: could not auto-create invoice for sample {sample_code}: {exc}")

    # Auto-generate a draft report for this sample so it shows up under Reports immediately,
    # matching the preview already available under Samples.
    try:
        from app.models.report import Report, ReportType
        from app.routers.reports import _next_report_number

        report_cust_id = sample.customer_id
        if not report_cust_id and payload.contract_id:
            c = db.query(Contract).filter(Contract.id == payload.contract_id).first()
            report_cust_id = c.customer_id if c else None

        report = Report(
            report_number=_next_report_number(db),
            contract_id=payload.contract_id,
            customer_id=report_cust_id,
            report_type=ReportType.test_report,
            content={
                "sample_id": sample.id,
                "report_title": "TEST REPORT",
                "overall_status": "COMPLETE",
            },
        )
        db.add(report)
    except Exception as exc:
        # Report creation is non-critical — log and continue
        print(f"[LIMS] Warning: could not auto-create report for sample {sample_code}: {exc}")

    db.commit()
    db.refresh(sample)
    log_action(db, current_user.id, "CREATE_SAMPLE", "sample", str(sample.id))
    return sample


@router.get("/{sample_id}", response_model=SampleOut)
def get_sample(sample_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sample = db.query(Sample).filter(Sample.id == sample_id).first()
    if not sample:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
    ensure_can_view_sample(current_user, sample, db)
    return sample


@router.put("/{sample_id}", response_model=SampleOut)
def update_sample(
    sample_id: int,
    payload: SampleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_staff(current_user)
    sample = db.query(Sample).filter(Sample.id == sample_id).first()
    if not sample:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
    update_data = payload.model_dump(exclude_unset=True)
    _apply_discharge_schedule(update_data)
    _clean_subcontracted(update_data, sample)
    _clean_accredited(update_data, sample)
    if "contract_id" in update_data and update_data["contract_id"] is not None:
        contract = db.query(Contract).filter(Contract.id == update_data["contract_id"]).first()
        if not contract:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")
    for k, v in update_data.items():
        setattr(sample, k, v)
    db.commit()
    db.refresh(sample)
    log_action(db, current_user.id, "UPDATE_SAMPLE", "sample", str(sample_id))
    return sample


@router.get("/{sample_id}/barcode")
def get_barcode(sample_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sample = db.query(Sample).filter(Sample.id == sample_id).first()
    if not sample:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
    ensure_can_view_sample(current_user, sample, db)
    if not sample.barcode_data:
        barcode = generate_barcode(sample.sample_code)
        sample.barcode_data = barcode
        db.commit()
    return {"sample_code": sample.sample_code, "barcode_base64": sample.barcode_data}


@router.post("/{sample_id}/custody", response_model=SampleOut)
def add_custody(
    sample_id: int,
    payload: CustodyEntry,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_staff(current_user)
    sample = db.query(Sample).filter(Sample.id == sample_id).first()
    if not sample:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
    custody =list(sample.chain_of_custody or [])
    custody.append(
        {
            "user_id": current_user.id,
            "action": payload.action,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )
    sample.chain_of_custody = custody
    db.commit()
    db.refresh(sample)
    log_action(db, current_user.id, "CUSTODY_ENTRY", "sample", str(sample_id))
    return sample
