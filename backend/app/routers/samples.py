from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user
from app.models.user import User, UserRole
from app.models.contract import Contract
from app.models.sample import Sample
from app.schemas.sample import SampleCreate, SampleUpdate, SampleOut, CustodyEntry
from app.services.audit import log_action
from app.services.barcode import generate_barcode

router = APIRouter(prefix="/samples", tags=["Samples"])


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
