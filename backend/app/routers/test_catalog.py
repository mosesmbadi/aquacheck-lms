from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.deps import require_role
from app.models.user import UserRole
from app.models.test_catalog import TestCatalogItem, TestCategory

router = APIRouter(prefix="/test-catalog", tags=["Test Catalog"])

# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class CatalogItemBase(BaseModel):
    name: str
    category: TestCategory
    unit: Optional[str] = None
    method_name: Optional[str] = None
    standard_limit: Optional[str] = None
    description: Optional[str] = None
    price: float = 0
    sort_order: int = 0
    is_active: bool = True


class CatalogItemCreate(CatalogItemBase):
    pass


class CatalogItemUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[TestCategory] = None
    unit: Optional[str] = None
    method_name: Optional[str] = None
    standard_limit: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class CatalogItemOut(CatalogItemBase):
    id: int
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True

    @classmethod
    def model_validate(cls, obj, **kwargs):
        data = {
            "id": obj.id,
            "name": obj.name,
            "category": obj.category,
            "unit": obj.unit,
            "method_name": obj.method_name,
            "standard_limit": obj.standard_limit,
            "description": obj.description,
            "price": float(obj.price) if obj.price is not None else 0,
            "sort_order": obj.sort_order,
            "is_active": obj.is_active,
            "created_at": obj.created_at.isoformat() if obj.created_at else "",
            "updated_at": obj.updated_at.isoformat() if obj.updated_at else "",
        }
        return cls(**data)


# ─── Default dialysis water tests ─────────────────────────────────────────────

DIALYSIS_WATER_TESTS = [
    # ── Physicochemical ──────────────────────────────────────────────────
    # Core parameters
    {"name": "pH", "category": "physicochemical", "unit": "", "method_name": "Direct Method", "standard_limit": "5.5 – 7.5", "sort_order": 1},
    {"name": "Conductivity µS/cm", "category": "physicochemical", "unit": "µS/cm", "method_name": "Direct Method", "standard_limit": "—", "sort_order": 2},
    {"name": "Total Dissolved Solids mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "Direct Method", "standard_limit": "—", "sort_order": 3},
    {"name": "Turbidity NTU", "category": "physicochemical", "unit": "NTU", "method_name": "Absorptometric Method: 8237", "standard_limit": "—", "sort_order": 4},
    {"name": "Total Hardness as CaCO₃ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA Method: 2340 C", "standard_limit": "—", "sort_order": 5},
    # Ions & inorganics
    {"name": "Calcium as Ca mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA Method: 3500-Ca B", "standard_limit": "2", "sort_order": 6},
    {"name": "Magnesium as Mg mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA Method: 3500-Mg B", "standard_limit": "4", "sort_order": 7},
    {"name": "Sodium as Na mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA Method: 3500-Na", "standard_limit": "70", "sort_order": 8},
    {"name": "Potassium as K mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA Method: 3500-K", "standard_limit": "8", "sort_order": 9},
    {"name": "Fluoride as F mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "SPADNS Method: 8029", "standard_limit": "0.2", "sort_order": 10},
    {"name": "Chloride as Cl mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA 4500-Cl B", "standard_limit": "50", "sort_order": 11},
    {"name": "Sulphates as SO₄ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "SulfaVer 4 Method: 8051", "standard_limit": "100", "sort_order": 12},
    {"name": "Nitrate as NO₃⁻ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "Cadmium reduction: 8039", "standard_limit": "2", "sort_order": 13},
    {"name": "Ammonia as NH₃-N mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "Salicylate Method: 8155", "standard_limit": "—", "sort_order": 14},
    {"name": "Total Alkalinity as CaCO₃ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA Method: 2340 C", "standard_limit": "—", "sort_order": 15},
    {"name": "P. Alkalinity as CaCO₃ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA Method: 2320 B", "standard_limit": "—", "sort_order": 16},
    {"name": "Bicarbonates as CaCO₃ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA Method: 2340 B", "standard_limit": "—", "sort_order": 17},
    {"name": "Carbonates as CaCO₃ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA Method: 2340 B", "standard_limit": "—", "sort_order": 18},
    {"name": "Silica as SiO₂ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "Silicomolybdate Method: 8185", "standard_limit": "0.1", "sort_order": 19},
    {"name": "Phosphates as PO₄³⁻ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "Orthophosphate Method: 8048", "standard_limit": "—", "sort_order": 20},
    # Chlorine
    {"name": "Free Chlorine mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "DPD Method: 8021", "standard_limit": "0.1", "sort_order": 21},
    {"name": "Total Chlorine mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "DPD Method: 8167", "standard_limit": "0.1", "sort_order": 22},
    {"name": "Chloramine as Cl₂ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "DPD Method", "standard_limit": "0.1", "sort_order": 23},
    # Organic
    {"name": "Total Organic Carbon mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "Combustion Method", "standard_limit": "0.5", "sort_order": 24},
    {"name": "Oxidizable Substances mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "Permanganate Method", "standard_limit": "—", "sort_order": 25},
    # Trace metals (µg/L)
    {"name": "Aluminium as Al µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "Eriochrome Cyanine R Method: 8012", "standard_limit": "10", "sort_order": 26},
    {"name": "Iron as Fe µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "Ferrover Method: 8008", "standard_limit": "100", "sort_order": 27},
    {"name": "Zinc as Zn µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "Zincon Method: 8009", "standard_limit": "100", "sort_order": 28},
    {"name": "Copper as Cu µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "Bicinchoninate Method: 8506", "standard_limit": "1", "sort_order": 29},
    {"name": "Manganese as Mn µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "PAN Method: 8034", "standard_limit": "50", "sort_order": 30},
    {"name": "Lead as Pb µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "AAS Method", "standard_limit": "5", "sort_order": 31},
    {"name": "Mercury as Hg µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "Cold Vapour AAS", "standard_limit": "0.2", "sort_order": 32},
    {"name": "Cadmium as Cd µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "AAS Method", "standard_limit": "1", "sort_order": 33},
    {"name": "Chromium as Cr µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "AAS Method", "standard_limit": "14", "sort_order": 34},
    {"name": "Arsenic as As µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "Arsenic Method: 8013", "standard_limit": "1", "sort_order": 35},
    {"name": "Barium as Ba µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "AAS Method", "standard_limit": "100", "sort_order": 36},
    {"name": "Selenium as Se µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "AAS Method", "standard_limit": "9", "sort_order": 37},
    {"name": "Antimony as Sb µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "AAS Method", "standard_limit": "6", "sort_order": 38},
    {"name": "Silver as Ag µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "AAS Method", "standard_limit": "1", "sort_order": 39},
    {"name": "Beryllium as Be µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "AAS Method", "standard_limit": "0.6", "sort_order": 40},
    {"name": "Thallium as Tl µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "AAS Method", "standard_limit": "2", "sort_order": 41},
    # ── Microbiological ──────────────────────────────────────────────────
    {"name": "E.coli CFU/100ml sample", "category": "microbiological", "unit": "CFU/100mL", "method_name": "KS ISO 9308-1:2014", "standard_limit": "Not Detectable", "sort_order": 50},
    {"name": "Total Coliforms CFU/100ml sample", "category": "microbiological", "unit": "CFU/100mL", "method_name": "KS ISO 9308-1:2014", "standard_limit": "Not Detectable", "sort_order": 51},
    {"name": "Total Viable Count CFU/ml sample at 22°C", "category": "microbiological", "unit": "CFU/mL", "method_name": "KS ISO 6222:1999", "standard_limit": "100", "sort_order": 52},
    {"name": "Total Viable Count CFU/ml sample at 37°C", "category": "microbiological", "unit": "CFU/mL", "method_name": "KS ISO 6222:1999", "standard_limit": "100", "sort_order": 53},
    {"name": "Pseudomonas aeruginosa CFU/100ml sample", "category": "microbiological", "unit": "CFU/100mL", "method_name": "KS ISO 16266:2006", "standard_limit": "Not Detectable", "sort_order": 54},
    {"name": "Salmonella spp CFU/100ml sample", "category": "microbiological", "unit": "CFU/100mL", "method_name": "KS ISO 6340:1995", "standard_limit": "Not Detectable", "sort_order": 55},
    {"name": "Streptococcus faecalis CFU/100ml sample", "category": "microbiological", "unit": "CFU/100mL", "method_name": "KS ISO 7899-2:1984", "standard_limit": "Not Detectable", "sort_order": 56},
    {"name": "Endotoxins (Pyrogens) EU/mL", "category": "microbiological", "unit": "EU/mL", "method_name": "LAL Gel-Clot Method", "standard_limit": "0.25", "sort_order": 57},
]


def seed_catalog(db: Session) -> int:
    """Insert default dialysis water tests if not already present. Returns count added."""
    existing_names = {row.name for row in db.query(TestCatalogItem.name).all()}
    added = 0
    for item in DIALYSIS_WATER_TESTS:
        if item["name"] not in existing_names:
            db.add(TestCatalogItem(**item))
            added += 1
    if added:
        db.commit()
    return added


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=List[CatalogItemOut])
def list_catalog(
    category: Optional[TestCategory] = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    q = db.query(TestCatalogItem)
    if active_only:
        q = q.filter(TestCatalogItem.is_active == True)  # noqa: E712
    if category:
        q = q.filter(TestCatalogItem.category == category)
    items = q.order_by(TestCatalogItem.sort_order, TestCatalogItem.name).all()
    return [CatalogItemOut.model_validate(i) for i in items]


@router.post("", response_model=CatalogItemOut, status_code=status.HTTP_201_CREATED)
def create_catalog_item(
    payload: CatalogItemCreate,
    db: Session = Depends(get_db),
    _=Depends(require_role(UserRole.admin, UserRole.manager)),
):
    item = TestCatalogItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return CatalogItemOut.model_validate(item)


@router.put("/{item_id}", response_model=CatalogItemOut)
def update_catalog_item(
    item_id: int,
    payload: CatalogItemUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_role(UserRole.admin, UserRole.manager)),
):
    item = db.query(TestCatalogItem).filter(TestCatalogItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return CatalogItemOut.model_validate(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_catalog_item(
    item_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_role(UserRole.admin, UserRole.manager)),
):
    item = db.query(TestCatalogItem).filter(TestCatalogItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    item.is_active = False
    db.commit()


@router.post("/seed", response_model=dict)
def reseed_catalog(
    db: Session = Depends(get_db),
    _=Depends(require_role(UserRole.admin)),
):
    added = seed_catalog(db)
    return {"added": added, "message": f"Seeded {added} new catalog items."}
