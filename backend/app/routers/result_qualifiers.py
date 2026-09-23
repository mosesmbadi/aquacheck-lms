from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.deps import require_role
from app.models.user import UserRole
from app.models.result_qualifier import ResultQualifier, QualifierKind, LegendScope

router = APIRouter(prefix="/result-qualifiers", tags=["Result Qualifiers"])


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class QualifierBase(BaseModel):
    code: str
    label: str
    kind: QualifierKind = QualifierKind.qualifier
    aliases: List[str] = []
    numeric_equivalent: Optional[float] = None
    exceeds_limit: bool = False
    is_detected: bool = False
    legend_scope: LegendScope = LegendScope.all
    show_in_legend: bool = True
    sort_order: int = 0
    is_active: bool = True


class QualifierCreate(QualifierBase):
    pass


class QualifierUpdate(BaseModel):
    code: Optional[str] = None
    label: Optional[str] = None
    kind: Optional[QualifierKind] = None
    aliases: Optional[List[str]] = None
    numeric_equivalent: Optional[float] = None
    exceeds_limit: Optional[bool] = None
    is_detected: Optional[bool] = None
    legend_scope: Optional[LegendScope] = None
    show_in_legend: Optional[bool] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class QualifierOut(QualifierBase):
    id: int

    class Config:
        from_attributes = True

    @classmethod
    def model_validate(cls, obj, **kwargs):
        return cls(
            id=obj.id,
            code=obj.code,
            label=obj.label,
            kind=obj.kind,
            aliases=list(obj.aliases or []),
            numeric_equivalent=obj.numeric_equivalent,
            exceeds_limit=bool(obj.exceeds_limit),
            is_detected=bool(obj.is_detected),
            legend_scope=obj.legend_scope,
            show_in_legend=bool(obj.show_in_legend),
            sort_order=obj.sort_order or 0,
            is_active=bool(obj.is_active),
        )


# ─── Default vocabulary ───────────────────────────────────────────────────────
# Seeded on first boot so a fresh install behaves the way the printed report always
# has. Everything here is a default, not a constant — admins edit it from the UI.

DEFAULT_QUALIFIERS = [
    # ── Result tokens (typed into a result box; drive the REMARKS column) ──
    {
        "code": "ND", "label": "Not Detectable", "kind": QualifierKind.qualifier,
        "aliases": ["nd", "not detectable", "not detected", "none detected",
                    "below detection limit", "bdl"],
        "numeric_equivalent": 0, "exceeds_limit": False, "is_detected": False,
        "legend_scope": LegendScope.all, "show_in_legend": True, "sort_order": 20,
    },
    {
        "code": "TNTC", "label": "Too Numerous To Count", "kind": QualifierKind.qualifier,
        "aliases": ["tntc", "too numerous to count", "uncountable"],
        # No numeric equivalent: TNTC sits above every finite limit, which exceeds_limit
        # expresses directly. is_detected keeps it failing "Not Detectable" limits too.
        "numeric_equivalent": None, "exceeds_limit": True, "is_detected": True,
        "legend_scope": LegendScope.all, "show_in_legend": True, "sort_order": 30,
    },
    {
        "code": "Detected", "label": "Detected", "kind": QualifierKind.qualifier,
        "aliases": ["detected", "present", "positive", "pos"],
        "numeric_equivalent": None, "exceeds_limit": False, "is_detected": True,
        "legend_scope": LegendScope.all, "show_in_legend": False, "sort_order": 32,
    },
    {
        "code": "Absent", "label": "Absent", "kind": QualifierKind.qualifier,
        # "Nil" also appears as a standard limit on the NEMA waste schedules.
        "aliases": ["absent", "nil", "negative", "neg", "not present"],
        "numeric_equivalent": 0, "exceeds_limit": False, "is_detected": False,
        "legend_scope": LegendScope.all, "show_in_legend": False, "sort_order": 34,
    },

    # ── Legend-only abbreviations ──
    {
        "code": "NS", "label": "No Set Standard", "kind": QualifierKind.abbreviation,
        "legend_scope": LegendScope.all, "sort_order": 10,
    },
    {
        "code": "KS", "label": "Kenya Standard", "kind": QualifierKind.abbreviation,
        "legend_scope": LegendScope.non_waste, "sort_order": 40,
    },
    {
        "code": "EAS", "label": "East African Standard", "kind": QualifierKind.abbreviation,
        "legend_scope": LegendScope.non_waste, "sort_order": 50,
    },
    {
        "code": "USEPA", "label": "United States Environmental Protection Agency",
        "kind": QualifierKind.abbreviation,
        "legend_scope": LegendScope.waste, "sort_order": 55,
    },
    {
        "code": "APHA", "label": "American Public Health Association",
        "kind": QualifierKind.abbreviation,
        "legend_scope": LegendScope.all, "sort_order": 60,
    },
    {
        "code": "CFU", "label": "Colony Forming Units", "kind": QualifierKind.abbreviation,
        "legend_scope": LegendScope.non_waste, "sort_order": 70,
    },
    {
        "code": "ISO", "label": "International Organisation for Standardisation",
        "kind": QualifierKind.abbreviation,
        "legend_scope": LegendScope.non_waste, "sort_order": 80,
    },
    {
        "code": "NEMA", "label": "National Environmental Management Authority",
        "kind": QualifierKind.abbreviation,
        "legend_scope": LegendScope.waste, "sort_order": 90,
    },
]


def seed_result_qualifiers(db: Session) -> int:
    """Insert any default qualifier missing from the table. Keyed by code. Returns count added."""
    existing = {row[0].lower() for row in db.query(ResultQualifier.code).all()}
    added = 0
    for item in DEFAULT_QUALIFIERS:
        if item["code"].lower() in existing:
            continue
        db.add(ResultQualifier(**item))
        added += 1
    if added:
        db.commit()
    return added


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=List[QualifierOut])
def list_qualifiers(
    kind: Optional[QualifierKind] = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    q = db.query(ResultQualifier)
    if active_only:
        q = q.filter(ResultQualifier.is_active == True)  # noqa: E712
    if kind:
        q = q.filter(ResultQualifier.kind == kind)
    items = q.order_by(ResultQualifier.sort_order, ResultQualifier.code).all()
    return [QualifierOut.model_validate(i) for i in items]


@router.post("", response_model=QualifierOut, status_code=status.HTTP_201_CREATED)
def create_qualifier(
    payload: QualifierCreate,
    db: Session = Depends(get_db),
    _=Depends(require_role(UserRole.admin, UserRole.manager)),
):
    clash = (
        db.query(ResultQualifier)
        .filter(ResultQualifier.code.ilike(payload.code.strip()))
        .first()
    )
    if clash:
        raise HTTPException(
            status_code=400,
            detail=f"A qualifier with code {payload.code} already exists.",
        )
    item = ResultQualifier(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return QualifierOut.model_validate(item)


@router.put("/{qualifier_id}", response_model=QualifierOut)
def update_qualifier(
    qualifier_id: int,
    payload: QualifierUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_role(UserRole.admin, UserRole.manager)),
):
    item = db.query(ResultQualifier).filter(ResultQualifier.id == qualifier_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Result qualifier not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return QualifierOut.model_validate(item)


@router.delete("/{qualifier_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_qualifier(
    qualifier_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_role(UserRole.admin, UserRole.manager)),
):
    item = db.query(ResultQualifier).filter(ResultQualifier.id == qualifier_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Result qualifier not found")
    db.delete(item)
    db.commit()


@router.post("/seed", response_model=dict)
def reseed_qualifiers(
    db: Session = Depends(get_db),
    _=Depends(require_role(UserRole.admin)),
):
    added = seed_result_qualifiers(db)
    return {"added": added, "message": f"Seeded {added} new result qualifiers."}
