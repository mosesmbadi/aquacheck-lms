from datetime import datetime, timezone, timedelta, date
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user
from app.models.user import User
from app.models.equipment import Equipment
from app.schemas.equipment import EquipmentCreate, EquipmentUpdate, EquipmentOut
from app.services.audit import log_action

router = APIRouter(prefix="/equipment", tags=["Equipment"])


@router.get("/calibration-due", response_model=List[EquipmentOut])
def calibration_due(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    threshold = date.today() + timedelta(days=30)
    return (
        db.query(Equipment)
        .filter(Equipment.is_active == True)  # noqa: E712
        .filter(Equipment.calibration_due_date <= threshold)
        .filter(Equipment.calibration_due_date != None)  # noqa: E711
        .order_by(Equipment.calibration_due_date.asc())
        .all()
    )


@router.get("", response_model=List[EquipmentOut])
def list_equipment(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    active_only: bool = True,
):
    query = db.query(Equipment)
    if active_only:
        query = query.filter(Equipment.is_active == True)  # noqa: E712
    return query.order_by(Equipment.created_at.desc()).all()


@router.post("", response_model=EquipmentOut, status_code=status.HTTP_201_CREATED)
def create_equipment(
    payload: EquipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(Equipment).filter(Equipment.equipment_id == payload.equipment_id).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Equipment ID already exists")
    equip = Equipment(**payload.model_dump())
    db.add(equip)
    db.commit()
    db.refresh(equip)
    log_action(db, current_user.id, "CREATE_EQUIPMENT", "equipment", str(equip.id))
    return equip


@router.get("/{equipment_id}", response_model=EquipmentOut)
def get_equipment(equipment_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    equip = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not equip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipment not found")
    return equip


@router.put("/{equipment_id}", response_model=EquipmentOut)
def update_equipment(
    equipment_id: int,
    payload: EquipmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    equip = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not equip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipment not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(equip, k, v)
    db.commit()
    db.refresh(equip)
    log_action(db, current_user.id, "UPDATE_EQUIPMENT", "equipment", str(equipment_id))
    return equip


@router.post("/{equipment_id}/toggle-active", response_model=EquipmentOut)
def toggle_equipment_active(
    equipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    equip = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not equip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipment not found")
    equip.is_active = 0 if equip.is_active == 1 else 1
    db.commit()
    db.refresh(equip)
    action = "DEACTIVATE_EQUIPMENT" if equip.is_active == 0 else "ACTIVATE_EQUIPMENT"
    log_action(db, current_user.id, action, "equipment", str(equipment_id))
    return equip
