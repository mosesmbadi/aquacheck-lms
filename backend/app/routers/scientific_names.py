from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.deps import require_role
from app.models.user import UserRole
from app.models.scientific_name import ScientificName

router = APIRouter(prefix="/scientific-names", tags=["Scientific Names"])


class ScientificNameCreate(BaseModel):
    term: str
    is_active: bool = True


class ScientificNameUpdate(BaseModel):
    term: Optional[str] = None
    is_active: Optional[bool] = None


class ScientificNameOut(BaseModel):
    id: int
    term: str
    is_active: bool

    class Config:
        from_attributes = True


def _clean(term: str) -> str:
    term = " ".join((term or "").split())
    if not term:
        raise HTTPException(status_code=400, detail="Name is required.")
    return term


def _ensure_unique(db: Session, term: str, exclude_id: Optional[int] = None) -> None:
    q = db.query(ScientificName).filter(ScientificName.term.ilike(term))
    if exclude_id is not None:
        q = q.filter(ScientificName.id != exclude_id)
    if q.first():
        raise HTTPException(status_code=400, detail=f'"{term}" is already in the list.')


@router.get("", response_model=List[ScientificNameOut])
def list_scientific_names(active_only: bool = False, db: Session = Depends(get_db)):
    q = db.query(ScientificName)
    if active_only:
        q = q.filter(ScientificName.is_active == True)  # noqa: E712
    return q.order_by(ScientificName.term).all()


@router.post("", response_model=ScientificNameOut, status_code=status.HTTP_201_CREATED)
def create_scientific_name(
    payload: ScientificNameCreate,
    db: Session = Depends(get_db),
    _=Depends(require_role(UserRole.admin, UserRole.manager)),
):
    term = _clean(payload.term)
    _ensure_unique(db, term)
    item = ScientificName(term=term, is_active=payload.is_active)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{item_id}", response_model=ScientificNameOut)
def update_scientific_name(
    item_id: int,
    payload: ScientificNameUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_role(UserRole.admin, UserRole.manager)),
):
    item = db.query(ScientificName).filter(ScientificName.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Scientific name not found")
    if payload.term is not None:
        term = _clean(payload.term)
        _ensure_unique(db, term, exclude_id=item_id)
        item.term = term
    if payload.is_active is not None:
        item.is_active = payload.is_active
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scientific_name(
    item_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_role(UserRole.admin, UserRole.manager)),
):
    item = db.query(ScientificName).filter(ScientificName.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Scientific name not found")
    db.delete(item)
    db.commit()
