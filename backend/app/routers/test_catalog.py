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
    water_type: str = "dialysis_potable"
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
    water_type: Optional[str] = None
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
            "water_type": obj.water_type if obj.water_type else "dialysis_potable",
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


# ─── Default dialysis / potable water tests ───────────────────────────────────

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


# ─── Waste water tests — Schedules 1–6 ───────────────────────────────────────

WASTE_SCHEDULE_TESTS = [
    # ── Schedule 1: Quality Standards for Sources of Domestic Water ──────────
    {"water_type": "waste_1", "name": "pH", "category": "physicochemical", "unit": "", "standard_limit": "6.5 – 8.5", "sort_order": 1},
    {"water_type": "waste_1", "name": "Suspended Solids", "category": "physicochemical", "unit": "mg/L", "standard_limit": "30", "sort_order": 2},
    {"water_type": "waste_1", "name": "Nitrate-NO3", "category": "physicochemical", "unit": "mg/L", "standard_limit": "10", "sort_order": 3},
    {"water_type": "waste_1", "name": "Nitrite-NO2", "category": "physicochemical", "unit": "mg/L", "standard_limit": "3", "sort_order": 4},
    {"water_type": "waste_1", "name": "Total Dissolved Solids", "category": "physicochemical", "unit": "mg/L", "standard_limit": "1200", "sort_order": 5},
    {"water_type": "waste_1", "name": "Fluoride", "category": "physicochemical", "unit": "mg/L", "standard_limit": "1.5", "sort_order": 6},
    {"water_type": "waste_1", "name": "Phenols", "category": "physicochemical", "unit": "mg/L", "standard_limit": "Nil", "sort_order": 7},
    {"water_type": "waste_1", "name": "Arsenic", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.01", "sort_order": 8},
    {"water_type": "waste_1", "name": "Cadmium", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.01", "sort_order": 9},
    {"water_type": "waste_1", "name": "Lead", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.05", "sort_order": 10},
    {"water_type": "waste_1", "name": "Selenium", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.01", "sort_order": 11},
    {"water_type": "waste_1", "name": "Copper", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.05", "sort_order": 12},
    {"water_type": "waste_1", "name": "Zinc", "category": "physicochemical", "unit": "mg/L", "standard_limit": "1.5", "sort_order": 13},
    {"water_type": "waste_1", "name": "Alkyl Benzyl Sulphonates", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.5", "sort_order": 14},
    {"water_type": "waste_1", "name": "Permanganate Value (PV)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "1.0", "sort_order": 15},
    {"water_type": "waste_1", "name": "Total Coliforms", "category": "microbiological", "unit": "per 100 ml", "standard_limit": "Nil", "sort_order": 50},

    # ── Schedule 2: Water Quality Monitoring for Sources of Domestic Water ───
    {"water_type": "waste_2", "name": "pH", "category": "physicochemical", "unit": "", "standard_limit": "6.5 – 8.5", "sort_order": 1},
    {"water_type": "waste_2", "name": "Suspended Solids", "category": "physicochemical", "unit": "mg/L", "standard_limit": "30", "sort_order": 2},
    {"water_type": "waste_2", "name": "Nitrate-NO3", "category": "physicochemical", "unit": "mg/L", "standard_limit": "10", "sort_order": 3},
    {"water_type": "waste_2", "name": "Ammonia-NH3", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.5", "sort_order": 4},
    {"water_type": "waste_2", "name": "Nitrite-NO2", "category": "physicochemical", "unit": "mg/L", "standard_limit": "3", "sort_order": 5},
    {"water_type": "waste_2", "name": "Total Dissolved Solids", "category": "physicochemical", "unit": "mg/L", "standard_limit": "1200", "sort_order": 6},
    {"water_type": "waste_2", "name": "Fluoride", "category": "physicochemical", "unit": "mg/L", "standard_limit": "1.5", "sort_order": 7},
    {"water_type": "waste_2", "name": "Phenols", "category": "physicochemical", "unit": "mg/L", "standard_limit": "Nil", "sort_order": 8},
    {"water_type": "waste_2", "name": "Arsenic", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.01", "sort_order": 9},
    {"water_type": "waste_2", "name": "Cadmium", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.01", "sort_order": 10},
    {"water_type": "waste_2", "name": "Lead", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.05", "sort_order": 11},
    {"water_type": "waste_2", "name": "Selenium", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.01", "sort_order": 12},
    {"water_type": "waste_2", "name": "Copper", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.05", "sort_order": 13},
    {"water_type": "waste_2", "name": "Zinc", "category": "physicochemical", "unit": "mg/L", "standard_limit": "1.5", "sort_order": 14},
    {"water_type": "waste_2", "name": "Alkyl Benzyl Sulphonates", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.5", "sort_order": 15},
    {"water_type": "waste_2", "name": "Permanganate Value", "category": "physicochemical", "unit": "mg/L", "standard_limit": "1.0", "sort_order": 16},
    {"water_type": "waste_2", "name": "Total Coliforms", "category": "microbiological", "unit": "per 100 ml", "standard_limit": "Nil", "sort_order": 50},

    # ── Schedule 3: Standards for Effluent Discharge Into the Environment ────
    {"water_type": "waste_3", "name": "pH (non-marine)", "category": "physicochemical", "unit": "", "standard_limit": "6.5 – 8.5", "sort_order": 1},
    {"water_type": "waste_3", "name": "pH (marine)", "category": "physicochemical", "unit": "", "standard_limit": "5.0 – 9.0", "sort_order": 2},
    {"water_type": "waste_3", "name": "BOD (5 days at 20°C)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "30", "sort_order": 3},
    {"water_type": "waste_3", "name": "COD", "category": "physicochemical", "unit": "mg/L", "standard_limit": "50", "sort_order": 4},
    {"water_type": "waste_3", "name": "Total Suspended Solids (TSS)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "30", "sort_order": 5},
    {"water_type": "waste_3", "name": "Total Dissolved Solids (TDS)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "1200", "sort_order": 6},
    {"water_type": "waste_3", "name": "Ammonia & Nitrate/Nitrite compounds (sum total)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "100", "sort_order": 7},
    {"water_type": "waste_3", "name": "Arsenic", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.02", "sort_order": 8},
    {"water_type": "waste_3", "name": "Benzene", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.1", "sort_order": 9},
    {"water_type": "waste_3", "name": "Boron", "category": "physicochemical", "unit": "mg/L", "standard_limit": "1.0", "sort_order": 10},
    {"water_type": "waste_3", "name": "Cadmium", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.01", "sort_order": 11},
    {"water_type": "waste_3", "name": "Carbon Tetrachloride", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.02", "sort_order": 12},
    {"water_type": "waste_3", "name": "Chloride", "category": "physicochemical", "unit": "mg/L", "standard_limit": "250", "sort_order": 13},
    {"water_type": "waste_3", "name": "Chlorine Free Residue", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.10", "sort_order": 14},
    {"water_type": "waste_3", "name": "Chromium VI", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.05", "sort_order": 15},
    {"water_type": "waste_3", "name": "Chromium (Total)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "2", "sort_order": 16},
    {"water_type": "waste_3", "name": "cis-1,2-Dichloroethylene", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.4", "sort_order": 17},
    {"water_type": "waste_3", "name": "Copper", "category": "physicochemical", "unit": "mg/L", "standard_limit": "1.0", "sort_order": 18},
    {"water_type": "waste_3", "name": "Dichloromethane", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.2", "sort_order": 19},
    {"water_type": "waste_3", "name": "Dissolved Iron", "category": "physicochemical", "unit": "mg/L", "standard_limit": "10", "sort_order": 20},
    {"water_type": "waste_3", "name": "Dissolved Manganese", "category": "physicochemical", "unit": "mg/L", "standard_limit": "10", "sort_order": 21},
    {"water_type": "waste_3", "name": "Fluoride (non-marine)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "1.5", "sort_order": 22},
    {"water_type": "waste_3", "name": "Fluoride (marine)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "8", "sort_order": 23},
    {"water_type": "waste_3", "name": "Lead", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.01", "sort_order": 24},
    {"water_type": "waste_3", "name": "Mercury (Total)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.005", "sort_order": 25},
    {"water_type": "waste_3", "name": "n-Hexane Extracts (Animal/Vegetable Fats)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "30", "sort_order": 26},
    {"water_type": "waste_3", "name": "n-Hexane Extracts (Mineral Oil)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "5", "sort_order": 27},
    {"water_type": "waste_3", "name": "Oil and Grease", "category": "physicochemical", "unit": "mg/L", "standard_limit": "Nil", "sort_order": 28},
    {"water_type": "waste_3", "name": "Organophosphorus Compounds", "category": "physicochemical", "unit": "mg/L", "standard_limit": "1.0", "sort_order": 29},
    {"water_type": "waste_3", "name": "PCBs (Polychlorinated Biphenyls)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.003", "sort_order": 30},
    {"water_type": "waste_3", "name": "Phenols", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.001", "sort_order": 31},
    {"water_type": "waste_3", "name": "Selenium", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.01", "sort_order": 32},
    {"water_type": "waste_3", "name": "Simazine", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.03", "sort_order": 33},
    {"water_type": "waste_3", "name": "Sulphide", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.1", "sort_order": 34},
    {"water_type": "waste_3", "name": "Temperature", "category": "physicochemical", "unit": "°C", "standard_limit": "Ambient ± 3", "sort_order": 35},
    {"water_type": "waste_3", "name": "Tetrachloroethylene", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.1", "sort_order": 36},
    {"water_type": "waste_3", "name": "Thiobencarb", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.1", "sort_order": 37},
    {"water_type": "waste_3", "name": "Thiram", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.06", "sort_order": 38},
    {"water_type": "waste_3", "name": "Total Nickel", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.3", "sort_order": 39},
    {"water_type": "waste_3", "name": "Colour", "category": "physicochemical", "unit": "Hazen Units", "standard_limit": "15", "sort_order": 40},
    {"water_type": "waste_3", "name": "Detergents", "category": "physicochemical", "unit": "mg/L", "standard_limit": "Nil", "sort_order": 41},
    {"water_type": "waste_3", "name": "Zinc", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.5", "sort_order": 42},
    {"water_type": "waste_3", "name": "Total Phosphorus", "category": "physicochemical", "unit": "mg/L", "standard_limit": "2", "sort_order": 43},
    {"water_type": "waste_3", "name": "Total Nitrogen", "category": "physicochemical", "unit": "mg/L", "standard_limit": "2", "sort_order": 44},
    {"water_type": "waste_3", "name": "1,1,1-Trichloroethane", "category": "physicochemical", "unit": "mg/L", "standard_limit": "3", "sort_order": 45},
    {"water_type": "waste_3", "name": "1,1,2-Trichloroethane", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.06", "sort_order": 46},
    {"water_type": "waste_3", "name": "1,1-Dichloroethylene", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.2", "sort_order": 47},
    {"water_type": "waste_3", "name": "1,2-Dichloroethane", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.04", "sort_order": 48},
    {"water_type": "waste_3", "name": "1,3-Dichloropropene", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.02", "sort_order": 49},
    {"water_type": "waste_3", "name": "Alkyl Mercury Compounds", "category": "physicochemical", "unit": "mg/L", "standard_limit": "Not Detectable", "sort_order": 50},
    {"water_type": "waste_3", "name": "E.coli", "category": "microbiological", "unit": "per 100 ml", "standard_limit": "Nil", "sort_order": 60},
    {"water_type": "waste_3", "name": "Total Coliforms", "category": "microbiological", "unit": "per 100 ml", "standard_limit": "30", "sort_order": 61},

    # ── Schedule 4: Monitoring Guide for Discharge Into the Environment ───────
    {"water_type": "waste_4", "name": "BOD (Biochemical Oxygen Demand)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 1},
    {"water_type": "waste_4", "name": "TSS (Total Suspended Solids)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 2},
    {"water_type": "waste_4", "name": "pH", "category": "physicochemical", "unit": "", "standard_limit": "—", "sort_order": 3},
    {"water_type": "waste_4", "name": "Oil and Grease", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 4},
    {"water_type": "waste_4", "name": "Temperature", "category": "physicochemical", "unit": "°C", "standard_limit": "—", "sort_order": 5},
    {"water_type": "waste_4", "name": "COD (Chemical Oxygen Demand)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 6},
    {"water_type": "waste_4", "name": "Colour/Dye/Pigment", "category": "physicochemical", "unit": "Hazen Units", "standard_limit": "—", "sort_order": 7},
    {"water_type": "waste_4", "name": "Elemental Phosphorus", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 8},
    {"water_type": "waste_4", "name": "Total Phosphorus", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 9},
    {"water_type": "waste_4", "name": "Ammonia (as N)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 10},
    {"water_type": "waste_4", "name": "Organic Nitrogen (as N)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 11},
    {"water_type": "waste_4", "name": "Nitrate", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 12},
    {"water_type": "waste_4", "name": "Flow", "category": "physicochemical", "unit": "m³/day", "standard_limit": "—", "sort_order": 13},
    {"water_type": "waste_4", "name": "Phenols", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 14},
    {"water_type": "waste_4", "name": "Sulphide", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 15},
    {"water_type": "waste_4", "name": "Total Chromium", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 16},
    {"water_type": "waste_4", "name": "Chromium VI", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 17},
    {"water_type": "waste_4", "name": "Copper", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 18},
    {"water_type": "waste_4", "name": "Nickel", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 19},
    {"water_type": "waste_4", "name": "Zinc", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 20},
    {"water_type": "waste_4", "name": "Total Cyanide", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 21},
    {"water_type": "waste_4", "name": "Fluorine", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 22},
    {"water_type": "waste_4", "name": "Free Available Chlorine", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 23},
    {"water_type": "waste_4", "name": "Residual Chlorine", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 24},
    {"water_type": "waste_4", "name": "Cadmium", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 25},
    {"water_type": "waste_4", "name": "Lead", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 26},
    {"water_type": "waste_4", "name": "Iron", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 27},
    {"water_type": "waste_4", "name": "Tin", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 28},
    {"water_type": "waste_4", "name": "Silver", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 29},
    {"water_type": "waste_4", "name": "Mercury (Total)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 30},
    {"water_type": "waste_4", "name": "Total Organic Carbon (TOC)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 31},
    {"water_type": "waste_4", "name": "Aluminium", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 32},
    {"water_type": "waste_4", "name": "Arsenic", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 33},
    {"water_type": "waste_4", "name": "Selenium", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 34},
    {"water_type": "waste_4", "name": "Barium", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 35},
    {"water_type": "waste_4", "name": "Manganese", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 36},
    {"water_type": "waste_4", "name": "Tannin", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 37},
    {"water_type": "waste_4", "name": "Settleable Solids", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 38},
    {"water_type": "waste_4", "name": "Surfactants", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 39},
    {"water_type": "waste_4", "name": "Faecal Coliforms", "category": "microbiological", "unit": "per 100 ml", "standard_limit": "—", "sort_order": 50},

    # ── Schedule 5: Standards for Effluent Discharge Into Public Sewers ──────
    {"water_type": "waste_5", "name": "Suspended Solids", "category": "physicochemical", "unit": "mg/L", "standard_limit": "250", "sort_order": 1},
    {"water_type": "waste_5", "name": "Total Dissolved Solids", "category": "physicochemical", "unit": "mg/L", "standard_limit": "2000", "sort_order": 2},
    {"water_type": "waste_5", "name": "Temperature", "category": "physicochemical", "unit": "°C", "standard_limit": "20 – 35", "sort_order": 3},
    {"water_type": "waste_5", "name": "pH", "category": "physicochemical", "unit": "", "standard_limit": "6 – 9", "sort_order": 4},
    {"water_type": "waste_5", "name": "Oil and Grease", "category": "physicochemical", "unit": "mg/L", "standard_limit": "5", "sort_order": 5},
    {"water_type": "waste_5", "name": "Ammonia Nitrogen", "category": "physicochemical", "unit": "mg/L", "standard_limit": "20", "sort_order": 6},
    {"water_type": "waste_5", "name": "BOD (5 days at 20°C)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "500", "sort_order": 7},
    {"water_type": "waste_5", "name": "COD", "category": "physicochemical", "unit": "mg/L", "standard_limit": "1000", "sort_order": 8},
    {"water_type": "waste_5", "name": "Arsenic", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.02", "sort_order": 9},
    {"water_type": "waste_5", "name": "Mercury", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.05", "sort_order": 10},
    {"water_type": "waste_5", "name": "Lead", "category": "physicochemical", "unit": "mg/L", "standard_limit": "1.0", "sort_order": 11},
    {"water_type": "waste_5", "name": "Cadmium", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.5", "sort_order": 12},
    {"water_type": "waste_5", "name": "Chromium VI", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.05", "sort_order": 13},
    {"water_type": "waste_5", "name": "Chromium (Total)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "2.0", "sort_order": 14},
    {"water_type": "waste_5", "name": "Copper", "category": "physicochemical", "unit": "mg/L", "standard_limit": "1.0", "sort_order": 15},
    {"water_type": "waste_5", "name": "Zinc", "category": "physicochemical", "unit": "mg/L", "standard_limit": "5.0", "sort_order": 16},
    {"water_type": "waste_5", "name": "Selenium", "category": "physicochemical", "unit": "mg/L", "standard_limit": "0.2", "sort_order": 17},
    {"water_type": "waste_5", "name": "Nickel", "category": "physicochemical", "unit": "mg/L", "standard_limit": "3.0", "sort_order": 18},
    {"water_type": "waste_5", "name": "Nitrates", "category": "physicochemical", "unit": "mg/L", "standard_limit": "20", "sort_order": 19},
    {"water_type": "waste_5", "name": "Phosphates", "category": "physicochemical", "unit": "mg/L", "standard_limit": "30", "sort_order": 20},
    {"water_type": "waste_5", "name": "Total Cyanide", "category": "physicochemical", "unit": "mg/L", "standard_limit": "2", "sort_order": 21},
    {"water_type": "waste_5", "name": "Sulphide", "category": "physicochemical", "unit": "mg/L", "standard_limit": "2", "sort_order": 22},
    {"water_type": "waste_5", "name": "Phenols", "category": "physicochemical", "unit": "mg/L", "standard_limit": "10", "sort_order": 23},
    {"water_type": "waste_5", "name": "Detergents", "category": "physicochemical", "unit": "mg/L", "standard_limit": "15", "sort_order": 24},
    {"water_type": "waste_5", "name": "Colour", "category": "physicochemical", "unit": "Hazen Units", "standard_limit": "< 40", "sort_order": 25},
    {"water_type": "waste_5", "name": "Alkyl Mercury", "category": "physicochemical", "unit": "mg/L", "standard_limit": "Not Detectable", "sort_order": 26},
    {"water_type": "waste_5", "name": "Free and Saline Ammonia (as N)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "4.0", "sort_order": 27},
    {"water_type": "waste_5", "name": "Calcium Carbide", "category": "physicochemical", "unit": "", "standard_limit": "Nil", "sort_order": 28},
    {"water_type": "waste_5", "name": "Chloroform", "category": "physicochemical", "unit": "mg/L", "standard_limit": "Nil", "sort_order": 29},
    {"water_type": "waste_5", "name": "Inflammable Solvents", "category": "physicochemical", "unit": "", "standard_limit": "Nil", "sort_order": 30},
    {"water_type": "waste_5", "name": "Radioactive Residues", "category": "physicochemical", "unit": "", "standard_limit": "Nil", "sort_order": 31},
    {"water_type": "waste_5", "name": "Degreasing Solvents", "category": "physicochemical", "unit": "", "standard_limit": "Nil", "sort_order": 32},

    # ── Schedule 6: Monitoring for Discharge of Treated Effluent Into Environment
    {"water_type": "waste_6", "name": "pH", "category": "physicochemical", "unit": "", "standard_limit": "6.5 – 8.5", "sort_order": 1},
    {"water_type": "waste_6", "name": "BOD (5 days at 20°C)", "category": "physicochemical", "unit": "mg/L", "standard_limit": "30", "sort_order": 2},
    {"water_type": "waste_6", "name": "COD", "category": "physicochemical", "unit": "mg/L", "standard_limit": "50", "sort_order": 3},
    {"water_type": "waste_6", "name": "Suspended Solids", "category": "physicochemical", "unit": "mg/L", "standard_limit": "30", "sort_order": 4},
    {"water_type": "waste_6", "name": "Ammonia-NH4+", "category": "physicochemical", "unit": "mg/L", "standard_limit": "100", "sort_order": 5},
    {"water_type": "waste_6", "name": "Nitrate-NO3 + Nitrite-NO2", "category": "physicochemical", "unit": "mg/L", "standard_limit": "—", "sort_order": 6},
    {"water_type": "waste_6", "name": "Total Dissolved Solids", "category": "physicochemical", "unit": "mg/L", "standard_limit": "1200", "sort_order": 7},
    {"water_type": "waste_6", "name": "E.coli", "category": "microbiological", "unit": "per 100 ml", "standard_limit": "Nil", "sort_order": 50},
]


def seed_catalog(db: Session) -> int:
    """Insert default catalog tests if not already present. Keyed by (name, water_type). Returns count added."""
    existing_pairs = {
        (row[0], row[1] or "dialysis_potable")
        for row in db.query(TestCatalogItem.name, TestCatalogItem.water_type).all()
    }
    all_items = (
        [{**item, "water_type": "dialysis_potable"} for item in DIALYSIS_WATER_TESTS]
        + WASTE_SCHEDULE_TESTS
    )
    added = 0
    for item in all_items:
        key = (item["name"], item.get("water_type", "dialysis_potable"))
        if key not in existing_pairs:
            db.add(TestCatalogItem(**item))
            added += 1
    if added:
        db.commit()
    return added


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=List[CatalogItemOut])
def list_catalog(
    category: Optional[TestCategory] = None,
    water_type: Optional[str] = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    q = db.query(TestCatalogItem)
    if active_only:
        q = q.filter(TestCatalogItem.is_active == True)  # noqa: E712
    if category:
        q = q.filter(TestCatalogItem.category == category)
    if water_type:
        q = q.filter(TestCatalogItem.water_type == water_type)
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
