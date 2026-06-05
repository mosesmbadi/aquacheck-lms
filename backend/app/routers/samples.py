from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user
from app.models.user import User, UserRole
from app.models.contract import Contract
from app.models.customer import Customer
from app.models.sample import Sample
from app.schemas.sample import SampleCreate, SampleUpdate, SampleOut, CustodyEntry
from app.services.audit import log_action
from app.services.barcode import generate_barcode

router = APIRouter(prefix="/samples", tags=["Samples"])

_DISCHARGE_TO_SCHEDULE = {"environment": 3, "public_sewer": 5}


def _apply_discharge_schedule(data: dict) -> None:
    dest = data.get("discharge_destination")
    if dest and data.get("waste_schedule") is None:
        data["waste_schedule"] = _DISCHARGE_TO_SCHEDULE.get(dest)


def _next_sample_code(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    max_seq = 0
    for (code,) in db.query(Sample.sample_code).filter(Sample.sample_code.like("QT/%/%")).all():
        try:
            seq = int(code.split("/")[1])
            if seq > max_seq:
                max_seq = seq
        except (IndexError, ValueError):
            continue
    return f"QT/{max_seq + 1}/{year}"


@router.get("", response_model=List[SampleOut])
def list_samples(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.customer and current_user.customer_id:
        cid = current_user.customer_id
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
    if payload.contract_id is not None:
        contract = db.query(Contract).filter(Contract.id == payload.contract_id).first()
        if not contract:
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

    db.commit()
    db.refresh(sample)
    log_action(db, current_user.id, "CREATE_SAMPLE", "sample", str(sample.id))
    return sample


@router.get("/{sample_id}", response_model=SampleOut)
def get_sample(sample_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    sample = db.query(Sample).filter(Sample.id == sample_id).first()
    if not sample:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
    return sample


@router.put("/{sample_id}", response_model=SampleOut)
def update_sample(
    sample_id: int,
    payload: SampleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sample = db.query(Sample).filter(Sample.id == sample_id).first()
    if not sample:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
    update_data = payload.model_dump(exclude_unset=True)
    _apply_discharge_schedule(update_data)
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
def get_barcode(sample_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    sample = db.query(Sample).filter(Sample.id == sample_id).first()
    if not sample:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
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
    sample = db.query(Sample).filter(Sample.id == sample_id).first()
    if not sample:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
    custody = list(sample.chain_of_custody or [])
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
