from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user
from app.models.user import User, UserRole
from app.models.complaint import Complaint, ComplaintStatus
from app.schemas.complaint import ComplaintCreate, ComplaintUpdate, ComplaintOut, ComplaintCloseRequest
from app.services.audit import log_action

router = APIRouter(prefix="/complaints", tags=["Complaints"])


def _next_complaint_number(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    count = db.query(Complaint).filter(Complaint.complaint_number.like(f"CMP-{year}-%")).count()
    return f"CMP-{year}-{str(count + 1).zfill(5)}"


@router.get("", response_model=List[ComplaintOut])
def list_complaints(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Complaint)
    if current_user.role == UserRole.customer and current_user.customer_id:
        q = q.filter(Complaint.customer_id == current_user.customer_id)
    return q.order_by(Complaint.created_at.desc()).all()


@router.post("", response_model=ComplaintOut, status_code=status.HTTP_201_CREATED)
def create_complaint(
    payload: ComplaintCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    complaint_data = payload.model_dump()
    # For customer users, always use their own customer_id regardless of payload
    if current_user.role == UserRole.customer:
        if not current_user.customer_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Your account is not linked to a customer. Contact an administrator.",
            )
        complaint_data["customer_id"] = current_user.customer_id
    complaint = Complaint(**complaint_data, complaint_number=_next_complaint_number(db))
    db.add(complaint)
    db.commit()
    db.refresh(complaint)
    log_action(db, current_user.id, "CREATE_COMPLAINT", "complaint", str(complaint.id))
    return complaint


@router.get("/{complaint_id}", response_model=ComplaintOut)
def get_complaint(complaint_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")
    return complaint


@router.put("/{complaint_id}", response_model=ComplaintOut)
def update_complaint(
    complaint_id: int,
    payload: ComplaintUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(complaint, k, v)
    db.commit()
    db.refresh(complaint)
    log_action(db, current_user.id, "UPDATE_COMPLAINT", "complaint", str(complaint_id))
    return complaint


@router.post("/{complaint_id}/investigate", response_model=ComplaintOut)
def investigate_complaint(
    complaint_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")
    complaint.status = ComplaintStatus.under_investigation
    db.commit()
    db.refresh(complaint)
    log_action(db, current_user.id, "INVESTIGATE_COMPLAINT", "complaint", str(complaint_id))
    return complaint


@router.post("/{complaint_id}/close", response_model=ComplaintOut)
def close_complaint(
    complaint_id: int,
    payload: ComplaintCloseRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")
    complaint.status = ComplaintStatus.closed
    complaint.closed_at = datetime.now(timezone.utc)
    complaint.closed_by = current_user.id
    if payload.corrective_action:
        complaint.corrective_action = payload.corrective_action
    db.commit()
    db.refresh(complaint)
    log_action(db, current_user.id, "CLOSE_COMPLAINT", "complaint", str(complaint_id))
    return complaint
