from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user, require_role
from app.models.user import User, UserRole
from app.models.contract import Contract, ContractStatus
from app.models.customer import Customer
from app.schemas.contract import ContractCreate, ContractUpdate, ContractOut
from app.services.access import ensure_staff, is_customer
from app.services.audit import log_action

router = APIRouter(prefix="/contracts", tags=["Contracts"])


def _next_contract_number(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    count = db.query(Contract).filter(Contract.contract_number.like(f"CNT-{year}-%")).count()
    return f"CNT-{year}-{str(count + 1).zfill(5)}"


@router.get("", response_model=List[ContractOut])
def list_contracts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Contract)
    if is_customer(current_user):
        if not current_user.customer_id:
            return []
        q = q.filter(Contract.customer_id == current_user.customer_id)
    return q.order_by(Contract.created_at.desc()).all()


@router.post("", response_model=ContractOut, status_code=status.HTTP_201_CREATED)
def create_contract(
    payload: ContractCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_staff(current_user)
    customer = db.query(Customer).filter(Customer.id == payload.customer_id).first()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

    contract = Contract(
        **payload.model_dump(),
        contract_number=_next_contract_number(db),
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(contract)
    db.commit()
    db.refresh(contract)
    log_action(db, current_user.id, "CREATE_CONTRACT", "contract", str(contract.id))
    return contract


@router.get("/{contract_id}", response_model=ContractOut)
def get_contract(contract_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract or (is_customer(current_user) and contract.customer_id != current_user.customer_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")
    return contract


@router.put("/{contract_id}", response_model=ContractOut)
def update_contract(
    contract_id: int,
    payload: ContractUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_staff(current_user)
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(contract, k, v)
    db.commit()
    db.refresh(contract)
    log_action(db, current_user.id, "UPDATE_CONTRACT", "contract", str(contract_id))
    return contract


@router.post("/{contract_id}/review", response_model=ContractOut)
def review_contract(
    contract_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.manager, UserRole.quality_manager)),
):
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")
    contract.status = ContractStatus.under_review
    contract.reviewed_by = current_user.id
    contract.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(contract)
    log_action(db, current_user.id, "REVIEW_CONTRACT", "contract", str(contract_id))
    return contract


@router.post("/{contract_id}/approve", response_model=ContractOut)
def approve_contract(
    contract_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.manager)),
):
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")
    contract.status = ContractStatus.approved
    contract.approved_by = current_user.id
    contract.approved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(contract)
    log_action(db, current_user.id, "APPROVE_CONTRACT", "contract", str(contract_id))
    return contract
