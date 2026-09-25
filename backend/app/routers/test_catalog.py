import re
import unicodedata
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.deps import require_role
from app.models.user import UserRole
from app.models.test_catalog import TestCatalogItem, TestCategory
from app.models.test_result import TestResult
from app.models.test_package import TestPackage, TestPackageItem

router = APIRouter(prefix="/test-catalog", tags=["Test Catalog"])

# ─── Schedule 4 — Industry types (EMCA Water Quality Regulations 2024) ────────

SCHEDULE_4_INDUSTRIES = [
    ("oil_gas",              "Oil and Gas"),
    ("fuel_dispensing",      "Fuel Dispensing Stations"),
    ("dairy",                "Dairy Products"),
    ("grain_mills",          "Grain Mills"),
    ("canned_fruits_veg",    "Canned Fruits and Vegetables"),
    ("canned_seafoods",      "Canned and Preserved Sea Foods"),
    ("sugar_processing",     "Sugar Processing"),
    ("textiles",             "Textiles"),
    ("cement",               "Cement Manufacturing"),
    ("feedlots",             "Feedlots"),
    ("electroplating",       "Electroplating"),
    ("organic_chemicals",    "Organic Chemicals"),
    ("inorganic_chemicals",  "Inorganic Chemicals"),
    ("plastics_synthetics",  "Plastics and Synthetics"),
    ("soap_detergents",      "Soap and Detergents"),
    ("fertilizer",           "Fertilizer Manufacturing"),
    ("petroleum_refining",   "Petroleum Refining"),
    ("iron_steel",           "Iron and Steel Manufacturing"),
    ("non_ferrous",          "Non-Ferrous Metal Manufacturing"),
    ("phosphate_manufacturing", "Phosphate Manufacturing"),
    ("steam_electric",       "Steam Electric Power Generating"),
    ("ferro_alloy",          "Ferro Alloy Manufacturing"),
    ("leather_tanning",      "Leather Tanning and Finishing"),
    ("glass",                "Glass Manufacturing"),
    ("extractives",          "Extractives"),
    ("asbestos",             "Asbestos Manufacturing"),
    ("rubber_processing",    "Rubber Processing"),
    ("timber",               "Timber Products"),
    ("pulp_paper",           "Pulp, Paper and Paperboard"),
    ("builders_paper",       "Builders Paper and Paperboard Mills"),
    ("meat_products",        "Meat Products"),
    ("paving_roofing",       "Paving and Roofing Materials"),
    ("intensive_chem_agri",  "Intensive Chemical Agriculture"),
    ("edible_oils_fats",     "Edible Vegetable Oils and Fats"),
    ("hotels_restaurants",   "Hotels, Restaurants and Game Lodges"),
    ("bakeries",             "Bakeries and Wheat Confectioneries"),
    ("breweries",            "Breweries (Malt)"),
    ("soft_drinks",          "Soft Drinks and Carbonated Waters"),
    ("sugar_confectionery",  "Sugar Confectionery"),
    ("tobacco",              "Tobacco Processing"),
    ("distilling",           "Distilling and Blending of Spirits"),
    ("motor_vehicle",        "Motor Vehicle Assembly"),
    ("paints_varnishes",     "Paints, Varnishes and Lacquers"),
    ("batteries",            "Batteries Manufacture"),
    ("cosmetics",            "Cosmetics"),
    ("printing",             "Printing, Publishing and Allied Industry"),
    ("domestic_sewage",      "Domestic Sewage System"),
    ("pharmaceuticals",      "Pharmaceutical Industries"),
    ("tea_coffee",           "Tea/Coffee Industries"),
    ("slaughter_houses",     "Slaughter Houses"),
    ("combined_sewage",      "Combined Sewage (Domestic + Industrial)"),
]

# Parameter name fragments matched against waste_3 / waste_5 catalog entries.
# Source: Fourth Schedule, EMCA Water Quality Regulations 2024.
_CORE = ["BOD", "Suspended Solids", "pH", "E.coli", "Total Coliforms",
         "Oil and Grease", "Temperature", "COD", "Colour"]

SCHEDULE_4_PARAMETERS: dict[str, list[str]] = {
    "oil_gas":              _CORE + ["Phenols", "Chromium", "Sulphide"],
    "fuel_dispensing":      _CORE + ["Phenols"],
    "dairy":                _CORE + ["Total Phosphorus", "Ammonia"],
    "grain_mills":          _CORE + ["Ammonia", "Total Phosphorus"],
    "canned_fruits_veg":    _CORE + ["Total Phosphorus", "Ammonia"],
    "canned_seafoods":      _CORE + ["Ammonia", "Total Phosphorus"],
    "sugar_processing":     _CORE + ["Total Phosphorus", "Ammonia", "Dissolved Manganese"],
    "textiles":             _CORE + ["Chromium", "Zinc", "Sulphide", "Total Phosphorus"],
    "cement":               _CORE + ["Fluoride"],
    "feedlots":             _CORE + ["Ammonia", "Total Phosphorus"],
    "electroplating":       _CORE + ["Chromium", "Copper", "Nickel", "Zinc", "Cyanide",
                                     "Lead", "Cadmium", "Mercury", "Arsenic"],
    "organic_chemicals":    _CORE + ["Phenols", "Total Phosphorus", "Ammonia", "Sulphide"],
    "inorganic_chemicals":  _CORE + ["Arsenic", "Lead", "Mercury", "Chromium", "Cadmium", "Fluoride"],
    "plastics_synthetics":  _CORE + ["Phenols", "Chromium", "Zinc"],
    "soap_detergents":      _CORE + ["Total Phosphorus", "Detergents"],
    "fertilizer":           _CORE + ["Total Phosphorus", "Ammonia", "Fluoride", "Arsenic", "Lead"],
    "petroleum_refining":   _CORE + ["Phenols", "Sulphide", "Chromium", "Lead"],
    "iron_steel":           _CORE + ["Phenols", "Chromium", "Zinc", "Lead",
                                     "Dissolved Iron", "Dissolved Manganese"],
    "non_ferrous":          _CORE + ["Chromium", "Copper", "Nickel", "Zinc",
                                     "Lead", "Cadmium", "Arsenic", "Mercury"],
    "phosphate_manufacturing": _CORE + ["Fluoride", "Arsenic", "Lead"],
    "steam_electric":       _CORE,
    "ferro_alloy":          _CORE + ["Chromium", "Zinc", "Dissolved Manganese"],
    "leather_tanning":      _CORE + ["Chromium", "Sulphide", "Lead", "Cyanide"],
    "glass":                _CORE + ["Fluoride", "Lead"],
    "extractives":          _CORE + ["Arsenic", "Lead", "Mercury", "Cadmium", "Dissolved Iron"],
    "asbestos":             _CORE,
    "rubber_processing":    _CORE + ["Zinc", "Sulphide"],
    "timber":               _CORE + ["Phenols"],
    "pulp_paper":           _CORE + ["Total Phosphorus", "Ammonia"],
    "builders_paper":       _CORE,
    "meat_products":        _CORE + ["Ammonia", "Total Phosphorus", "Sulphide"],
    "paving_roofing":       _CORE,
    "intensive_chem_agri":  _CORE + ["Total Phosphorus", "Ammonia", "Arsenic", "Lead"],
    "edible_oils_fats":     _CORE + ["Total Phosphorus"],
    "hotels_restaurants":   _CORE + ["Ammonia", "Total Phosphorus", "Detergents"],
    "bakeries":             _CORE + ["Ammonia", "Total Phosphorus"],
    "breweries":            _CORE + ["Total Phosphorus", "Ammonia", "Zinc"],
    "soft_drinks":          _CORE + ["Ammonia"],
    "sugar_confectionery":  _CORE + ["Ammonia", "Total Phosphorus"],
    "tobacco":              _CORE,
    "distilling":           _CORE + ["Total Phosphorus", "Ammonia"],
    "motor_vehicle":        _CORE + ["Chromium", "Zinc", "Lead", "Copper"],
    "paints_varnishes":     _CORE + ["Lead", "Chromium", "Zinc", "Cadmium"],
    "batteries":            _CORE + ["Lead", "Cadmium", "Arsenic", "Mercury"],
    "cosmetics":            _CORE + ["Lead", "Mercury", "Arsenic"],
    "printing":             _CORE + ["Chromium", "Copper", "Zinc", "Lead"],
    "domestic_sewage":      _CORE + ["Total Phosphorus", "Ammonia", "Lead", "Mercury"],
    "pharmaceuticals":      _CORE + ["Lead", "Mercury", "Zinc", "Cadmium", "Arsenic"],
    "tea_coffee":           _CORE + ["Copper", "Lead", "Dissolved Iron", "Dissolved Manganese", "Sulphide"],
    "slaughter_houses":     _CORE + ["Ammonia", "Sulphide", "Lead", "Dissolved Iron"],
    "combined_sewage":      _CORE + ["Total Phosphorus", "Ammonia", "Lead", "Mercury", "Dissolved Iron"],
}

# ─── Pydantic schemas ─────────────────────────────────────────────────────────

# Plain strings (not the Enum) so they drop straight into the String column.
RemarkRuleValue = Literal["compliance", "contamination_rating", "manual"]


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
    section: Optional[str] = None
    remark_rule: Optional[RemarkRuleValue] = None
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
    section: Optional[str] = None
    remark_rule: Optional[RemarkRuleValue] = None
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
            "section": obj.section,
            "remark_rule": obj.remark_rule,
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


# ─── Potable water tests — Kenya Standard KS 459 / EAS 12 / WHO ──────────────

POTABLE_WATER_TESTS = [
    # ── Physicochemical ──────────────────────────────────────────────────────
    {"name": "pH", "category": "physicochemical", "unit": "", "method_name": "Direct Method", "standard_limit": "6.5 – 8.5", "sort_order": 1},
    {"name": "Conductivity µS/cm", "category": "physicochemical", "unit": "µS/cm", "method_name": "Direct Method", "standard_limit": "2500", "sort_order": 2},
    {"name": "Total Dissolved Solids mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "Direct Method", "standard_limit": "1000", "sort_order": 3},
    {"name": "Turbidity NTU", "category": "physicochemical", "unit": "NTU", "method_name": "Absorptometric Method: 8237", "standard_limit": "5", "sort_order": 4},
    {"name": "Colour TCU", "category": "physicochemical", "unit": "TCU", "method_name": "Platinum-Cobalt Method", "standard_limit": "15", "sort_order": 5},
    {"name": "Odour", "category": "physicochemical", "unit": "", "method_name": "Organoleptic", "standard_limit": "Unobjectionable", "sort_order": 6},
    {"name": "Taste", "category": "physicochemical", "unit": "", "method_name": "Organoleptic", "standard_limit": "Unobjectionable", "sort_order": 7},
    {"name": "Total Hardness as CaCO₃ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA Method: 2340 C", "standard_limit": "500", "sort_order": 8},
    {"name": "Calcium as Ca mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA Method: 3500-Ca B", "standard_limit": "150", "sort_order": 9},
    {"name": "Magnesium as Mg mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA Method: 3500-Mg B", "standard_limit": "100", "sort_order": 10},
    {"name": "Sodium as Na mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA Method: 3500-Na", "standard_limit": "200", "sort_order": 11},
    {"name": "Potassium as K mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA Method: 3500-K", "standard_limit": "50", "sort_order": 12},
    {"name": "Fluoride as F mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "SPADNS Method: 8029", "standard_limit": "1.5", "sort_order": 13},
    {"name": "Chloride as Cl mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA 4500-Cl B", "standard_limit": "250", "sort_order": 14},
    {"name": "Sulphates as SO₄ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "SulfaVer 4 Method: 8051", "standard_limit": "250", "sort_order": 15},
    {"name": "Nitrate as NO₃⁻ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "Cadmium reduction: 8039", "standard_limit": "50", "sort_order": 16},
    {"name": "Nitrite as NO₂⁻ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "Diazotization Method", "standard_limit": "0.5", "sort_order": 17},
    {"name": "Ammonia as NH₃-N mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "Salicylate Method: 8155", "standard_limit": "1.5", "sort_order": 18},
    {"name": "Total Alkalinity as CaCO₃ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA Method: 2340 C", "standard_limit": "—", "sort_order": 19},
    {"name": "Phosphates as PO₄³⁻ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "Orthophosphate Method: 8048", "standard_limit": "0.5", "sort_order": 20},
    {"name": "Free Chlorine mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "DPD Method: 8021", "standard_limit": "0.2 – 0.5", "sort_order": 21},
    {"name": "Total Chlorine mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "DPD Method: 8167", "standard_limit": "5.0", "sort_order": 22},
    {"name": "Dissolved Oxygen mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "Winkler/Membrane Electrode", "standard_limit": "≥ 5", "sort_order": 23},
    # Trace metals (µg/L)
    {"name": "Aluminium as Al µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "Eriochrome Cyanine R Method: 8012", "standard_limit": "200", "sort_order": 30},
    {"name": "Iron as Fe µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "Ferrover Method: 8008", "standard_limit": "300", "sort_order": 31},
    {"name": "Manganese as Mn µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "PAN Method: 8034", "standard_limit": "100", "sort_order": 32},
    {"name": "Copper as Cu µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "Bicinchoninate Method: 8506", "standard_limit": "2000", "sort_order": 33},
    {"name": "Zinc as Zn µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "Zincon Method: 8009", "standard_limit": "3000", "sort_order": 34},
    {"name": "Lead as Pb µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "AAS Method", "standard_limit": "10", "sort_order": 35},
    {"name": "Arsenic as As µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "Arsenic Method: 8013", "standard_limit": "10", "sort_order": 36},
    {"name": "Chromium as Cr µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "AAS Method", "standard_limit": "50", "sort_order": 37},
    {"name": "Cadmium as Cd µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "AAS Method", "standard_limit": "3", "sort_order": 38},
    {"name": "Mercury as Hg µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "Cold Vapour AAS", "standard_limit": "1", "sort_order": 39},
    {"name": "Cyanide as CN⁻ µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "Pyridine-Barbituric Acid", "standard_limit": "70", "sort_order": 40},
    {"name": "Selenium as Se µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "AAS Method", "standard_limit": "40", "sort_order": 41},
    # ── Microbiological ──────────────────────────────────────────────────────
    {"name": "E.coli CFU/100ml sample", "category": "microbiological", "unit": "CFU/100mL", "method_name": "KS ISO 9308-1:2014", "standard_limit": "Not Detectable", "sort_order": 50},
    {"name": "Total Coliforms CFU/100ml sample", "category": "microbiological", "unit": "CFU/100mL", "method_name": "KS ISO 9308-1:2014", "standard_limit": "Not Detectable", "sort_order": 51},
    {"name": "Total Viable Count CFU/ml at 22°C", "category": "microbiological", "unit": "CFU/mL", "method_name": "KS ISO 6222:1999", "standard_limit": "100", "sort_order": 52},
    {"name": "Total Viable Count CFU/ml at 37°C", "category": "microbiological", "unit": "CFU/mL", "method_name": "KS ISO 6222:1999", "standard_limit": "20", "sort_order": 53},
    {"name": "Pseudomonas aeruginosa CFU/100ml sample", "category": "microbiological", "unit": "CFU/100mL", "method_name": "KS ISO 16266:2006", "standard_limit": "Not Detectable", "sort_order": 54},
    {"name": "Salmonella spp CFU/100ml sample", "category": "microbiological", "unit": "CFU/100mL", "method_name": "KS ISO 6340:1995", "standard_limit": "Not Detectable", "sort_order": 55},
    {"name": "Streptococcus faecalis CFU/100ml sample", "category": "microbiological", "unit": "CFU/100mL", "method_name": "KS ISO 7899-2:1984", "standard_limit": "Not Detectable", "sort_order": 56},
]


# ─── Packaged drinking water — KS EAS 12 / Kenya Bureau of Standards ─────────

PACKAGED_DRINKING_WATER_TESTS = [
    # ── Physicochemical ──────────────────────────────────────────────────────
    {"name": "pH", "category": "physicochemical", "unit": "", "method_name": "Direct Method", "standard_limit": "6.5 – 8.5", "sort_order": 1},
    {"name": "Conductivity µS/cm", "category": "physicochemical", "unit": "µS/cm", "method_name": "Direct Method", "standard_limit": "2500", "sort_order": 2},
    {"name": "Total Dissolved Solids mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "Direct Method", "standard_limit": "1000", "sort_order": 3},
    {"name": "Turbidity NTU", "category": "physicochemical", "unit": "NTU", "method_name": "Absorptometric Method: 8237", "standard_limit": "4", "sort_order": 4},
    {"name": "Colour TCU", "category": "physicochemical", "unit": "TCU", "method_name": "Platinum-Cobalt Method", "standard_limit": "15", "sort_order": 5},
    {"name": "Odour", "category": "physicochemical", "unit": "", "method_name": "Organoleptic", "standard_limit": "Unobjectionable", "sort_order": 6},
    {"name": "Taste", "category": "physicochemical", "unit": "", "method_name": "Organoleptic", "standard_limit": "Unobjectionable", "sort_order": 7},
    {"name": "Total Hardness as CaCO₃ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA Method: 2340 C", "standard_limit": "500", "sort_order": 8},
    {"name": "Calcium as Ca mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA Method: 3500-Ca B", "standard_limit": "150", "sort_order": 9},
    {"name": "Magnesium as Mg mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA Method: 3500-Mg B", "standard_limit": "100", "sort_order": 10},
    {"name": "Sodium as Na mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA Method: 3500-Na", "standard_limit": "200", "sort_order": 11},
    {"name": "Potassium as K mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA Method: 3500-K", "standard_limit": "50", "sort_order": 12},
    {"name": "Fluoride as F mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "SPADNS Method: 8029", "standard_limit": "1.5", "sort_order": 13},
    {"name": "Chloride as Cl mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA 4500-Cl B", "standard_limit": "250", "sort_order": 14},
    {"name": "Sulphates as SO₄ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "SulfaVer 4 Method: 8051", "standard_limit": "250", "sort_order": 15},
    {"name": "Nitrate as NO₃⁻ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "Cadmium reduction: 8039", "standard_limit": "50", "sort_order": 16},
    {"name": "Nitrite as NO₂⁻ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "Diazotization Method", "standard_limit": "0.1", "sort_order": 17},
    {"name": "Ammonia as NH₃-N mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "Salicylate Method: 8155", "standard_limit": "0.5", "sort_order": 18},
    {"name": "Bicarbonates as CaCO₃ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "APHA Method: 2340 B", "standard_limit": "—", "sort_order": 19},
    {"name": "Phosphates as PO₄³⁻ mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "Orthophosphate Method: 8048", "standard_limit": "0.5", "sort_order": 20},
    {"name": "Total Organic Carbon mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "Combustion Method", "standard_limit": "2.0", "sort_order": 21},
    {"name": "Dissolved Oxygen mg/L", "category": "physicochemical", "unit": "mg/L", "method_name": "Membrane Electrode Method", "standard_limit": "≥ 5", "sort_order": 22},
    # Trace metals (µg/L)
    {"name": "Aluminium as Al µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "Eriochrome Cyanine R Method: 8012", "standard_limit": "200", "sort_order": 30},
    {"name": "Iron as Fe µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "Ferrover Method: 8008", "standard_limit": "300", "sort_order": 31},
    {"name": "Manganese as Mn µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "PAN Method: 8034", "standard_limit": "100", "sort_order": 32},
    {"name": "Copper as Cu µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "Bicinchoninate Method: 8506", "standard_limit": "2000", "sort_order": 33},
    {"name": "Zinc as Zn µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "Zincon Method: 8009", "standard_limit": "3000", "sort_order": 34},
    {"name": "Lead as Pb µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "AAS Method", "standard_limit": "10", "sort_order": 35},
    {"name": "Arsenic as As µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "Arsenic Method: 8013", "standard_limit": "10", "sort_order": 36},
    {"name": "Chromium as Cr µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "AAS Method", "standard_limit": "50", "sort_order": 37},
    {"name": "Cadmium as Cd µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "AAS Method", "standard_limit": "3", "sort_order": 38},
    {"name": "Mercury as Hg µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "Cold Vapour AAS", "standard_limit": "1", "sort_order": 39},
    {"name": "Antimony as Sb µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "AAS Method", "standard_limit": "20", "sort_order": 40},
    {"name": "Selenium as Se µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "AAS Method", "standard_limit": "40", "sort_order": 41},
    {"name": "Cyanide as CN⁻ µg/L", "category": "physicochemical", "unit": "µg/L", "method_name": "Pyridine-Barbituric Acid", "standard_limit": "70", "sort_order": 42},
    # ── Microbiological ──────────────────────────────────────────────────────
    {"name": "E.coli CFU/100ml sample", "category": "microbiological", "unit": "CFU/100mL", "method_name": "KS ISO 9308-1:2014", "standard_limit": "Not Detectable", "sort_order": 50},
    {"name": "Total Coliforms CFU/100ml sample", "category": "microbiological", "unit": "CFU/100mL", "method_name": "KS ISO 9308-1:2014", "standard_limit": "Not Detectable", "sort_order": 51},
    {"name": "Total Viable Count CFU/ml at 22°C", "category": "microbiological", "unit": "CFU/mL", "method_name": "KS ISO 6222:1999", "standard_limit": "100", "sort_order": 52},
    {"name": "Total Viable Count CFU/ml at 37°C", "category": "microbiological", "unit": "CFU/mL", "method_name": "KS ISO 6222:1999", "standard_limit": "20", "sort_order": 53},
    {"name": "Pseudomonas aeruginosa CFU/100ml sample", "category": "microbiological", "unit": "CFU/100mL", "method_name": "KS ISO 16266:2006", "standard_limit": "Not Detectable", "sort_order": 54},
    {"name": "Salmonella spp CFU/100ml sample", "category": "microbiological", "unit": "CFU/100mL", "method_name": "KS ISO 6340:1995", "standard_limit": "Not Detectable", "sort_order": 55},
    {"name": "Streptococcus faecalis CFU/100ml sample", "category": "microbiological", "unit": "CFU/100mL", "method_name": "KS ISO 7899-2:1984", "standard_limit": "Not Detectable", "sort_order": 56},
    {"name": "Staphylococcus aureus CFU/100ml sample", "category": "microbiological", "unit": "CFU/100mL", "method_name": "ISO 6888", "standard_limit": "Not Detectable", "sort_order": 57},
]


# ─── Paints, paint raw materials & plant areas — ASTM D5588 / D4300 ─────────
# No specification column on these reports: D5588 counts are rated on the lab's
# contamination scale, D4300 susceptibility results are rated by the analyst.

PAINT_TESTS = [
    {"name": "Total Bacterial Count", "category": "microbiological", "unit": "CFU", "method_name": "ASTM D 5588-97", "standard_limit": "—", "remark_rule": "contamination_rating", "sort_order": 10},
    {"name": "Yeast and Molds", "category": "microbiological", "unit": "CFU", "method_name": "ASTM D 5588-97", "standard_limit": "—", "remark_rule": "contamination_rating", "sort_order": 20},
    {"name": "Potato Dextrose Agar", "category": "microbiological", "unit": "", "method_name": "ASTM D 4300-01", "standard_limit": "—", "remark_rule": "manual", "section": "SUSCEPTIBILITY TEST", "sort_order": 30},
    {"name": "Mineral Salts Agar", "category": "microbiological", "unit": "", "method_name": "ASTM D 4300-01", "standard_limit": "—", "remark_rule": "manual", "section": "SUSCEPTIBILITY TEST", "sort_order": 40},
]


_CHLORINE_NAMES = {"Free Chlorine mg/L", "Total Chlorine mg/L", "Chloramine as Cl₂ mg/L"}


# ─── Default report order for drinking-water types ───────────────────────────
# Mirrors the parameter order on the lab's established test report. Applies to the
# dialysis/potable/packaged sets; waste schedules keep their NEMA schedule order.
#
# Each entry lists the names a parameter may go by. Matching is on the start of the
# test name, ignoring case, units, punctuation, subscripts and plurals — so tests the
# lab adds itself ("Total Suspended Solids mg/L", "Calcium Hardness as CaCO3") slot
# into place too. An alias given as (name, token) also needs that token in the name,
# e.g. to tell the 37°C and 22°C plate counts apart. Tests matching nothing sort after
# the listed ones, keeping their relative order.

DEFAULT_REPORT_ORDER = [
    # Physicochemical
    ["ph"],
    ["colour", "color"],
    ["odour", "odor"],
    ["taste"],
    ["turbidity"],
    ["total suspended solids", "suspended solids", "tss"],
    ["total dissolved solids", "dissolved solids", "tds"],
    ["conductivity", "electrical conductivity", "ec"],
    ["p alkalinity", "phenolphthalein alkalinity"],
    ["total alkalinity", "alkalinity"],
    ["fluoride"],
    ["iron", "total iron", "dissolved iron"],
    ["chloride"],
    ["nitrate"],
    ["nitrite"],
    ["sulphate", "sulfate"],
    ["ammonia"],
    ["zinc"],
    ["phosphate", "orthophosphate"],
    ["carbonate"],
    ["bicarbonate"],
    ["calcium"],
    ["magnesium"],
    ["calcium hardness"],
    ["magnesium hardness"],
    ["total hardness", "hardness"],
    ["silica"],
    ["sodium"],
    ["potassium"],
    ["free chlorine", "free residual chlorine"],
    ["total chlorine", "residual chlorine"],
    ["chloramine"],
    ["dissolved oxygen"],
    ["total organic carbon", "toc"],
    ["oxidizable substance", "oxidisable substance"],
    ["aluminium", "aluminum"],
    ["manganese"],
    ["copper"],
    ["lead"],
    ["arsenic"],
    ["chromium"],
    ["cadmium"],
    ["mercury"],
    ["cyanide"],
    ["selenium"],
    ["antimony"],
    ["barium"],
    ["silver"],
    ["beryllium"],
    ["thallium"],
    # Microbiological
    ["e coli", "ecoli", "escherichia coli"],
    ["total coliform"],
    ["faecal coliform", "fecal coliform"],
    [("total viable count", "37"), ("tvc", "37"), "total viable count", "tvc"],
    [("total viable count", "22"), ("tvc", "22")],
    ["pseudomonas"],
    ["salmonella"],
    ["streptococcus", "faecal streptococci", "fecal streptococci", "enterococci"],
    ["staphylococcus"],
    ["endotoxin"],
]
# Gaps of 10 leave room to slot a test in between from the catalog screen.
_UNLISTED_ORDER_OFFSET = (len(DEFAULT_REPORT_ORDER) + 1) * 10


def _name_tokens(text: str) -> list:
    # NFKD turns subscripts/superscripts into plain digits (CaCO₃ → CaCO3).
    text = unicodedata.normalize("NFKD", text).lower()
    words = re.sub(r"[^a-z0-9]+", " ", text).split()
    # Drop a plural "s" so "Sulphates" and "Sulphate" compare equal.
    return [w[:-1] if len(w) > 3 and w.endswith("s") else w for w in words]


def _default_order_position(name: str):
    tokens = _name_tokens(name)
    best = None  # (score, position)
    for index, aliases in enumerate(DEFAULT_REPORT_ORDER):
        for alias in aliases:
            prefix, required = alias if isinstance(alias, tuple) else (alias, None)
            prefix_tokens = _name_tokens(prefix)
            if tokens[: len(prefix_tokens)] != prefix_tokens:
                continue
            if required and required not in tokens:
                continue
            # The longest (most specific) alias wins: "calcium hardness" over "calcium".
            score = len(prefix_tokens) + (0.5 if required else 0)
            if best is None or score > best[0]:
                best = (score, (index + 1) * 10)
    return best[1] if best else None


def default_sort_order(name: str, current: int = 0) -> int:
    position = _default_order_position(name)
    if position is not None:
        return position
    current = current or 0
    # Already pushed past the listed tests (e.g. by an earlier run) — leave as is.
    if current >= _UNLISTED_ORDER_OFFSET:
        return current
    return _UNLISTED_ORDER_OFFSET + current


def _uses_default_order(water_type) -> bool:
    # Waste schedules follow NEMA order; paint tests have their own short list.
    wt = str(water_type or "")
    return not wt.startswith("waste_") and wt != "paint"


def apply_default_report_order(db: Session) -> int:
    """Reset Sort Order on existing drinking-water catalog items to DEFAULT_REPORT_ORDER.
    Overwrites manual Sort Order edits on those items. Returns count updated."""
    updated = 0
    for item in db.query(TestCatalogItem).all():
        if not _uses_default_order(item.water_type):
            continue
        target = default_sort_order(item.name, item.sort_order)
        if item.sort_order != target:
            item.sort_order = target
            updated += 1
    if updated:
        db.commit()
    return updated

def seed_catalog(db: Session) -> int:
    """Insert default catalog tests if not already present. Keyed by (name, water_type). Returns count added."""
    existing_pairs = {
        (row[0], row[1] or "dialysis_potable")
        for row in db.query(TestCatalogItem.name, TestCatalogItem.water_type).all()
    }
    # potable_treated  = full potable set (incl. residual chlorine for chlorinated sources)
    # potable_natural  = potable set minus chlorine/disinfection (borehole, spring, river, rain)
    potable_natural = [i for i in POTABLE_WATER_TESTS if i["name"] not in _CHLORINE_NAMES]
    all_items = (
        [{**item, "water_type": "dialysis_potable"} for item in DIALYSIS_WATER_TESTS]
        + [{**item, "water_type": "potable"} for item in POTABLE_WATER_TESTS]
        + [{**item, "water_type": "potable_treated"} for item in POTABLE_WATER_TESTS]
        + [{**item, "water_type": "potable_natural"} for item in potable_natural]
        + [{**item, "water_type": "packaged_drinking_water"} for item in PACKAGED_DRINKING_WATER_TESTS]
        + WASTE_SCHEDULE_TESTS
        + [{**item, "water_type": "paint"} for item in PAINT_TESTS]
    )
    added = 0
    for item in all_items:
        key = (item["name"], item.get("water_type", "dialysis_potable"))
        if key not in existing_pairs:
            if _uses_default_order(item.get("water_type")):
                item = {**item, "sort_order": default_sort_order(item["name"], item.get("sort_order", 0))}
            db.add(TestCatalogItem(**item))
            added += 1
    if added:
        db.commit()
    return added


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/industry-types")
def list_industry_types():
    """Return all Schedule 4 waste water industry types."""
    return [{"value": v, "label": l} for v, l in SCHEDULE_4_INDUSTRIES]


@router.get("/suggested", response_model=List[CatalogItemOut])
def suggested_waste_parameters(
    industry_type: str,
    discharge_destination: str,
    db: Session = Depends(get_db),
):
    """
    Return catalog items suggested for a waste water sample based on Schedule 4
    (industry type) and the applicable standard (Schedule 3 for environment,
    Schedule 5 for public sewer).
    """
    params = SCHEDULE_4_PARAMETERS.get(industry_type)
    if params is None:
        raise HTTPException(status_code=404, detail=f"Unknown industry type: {industry_type}")

    water_type_map = {"environment": "waste_3", "public_sewer": "waste_5"}
    water_type = water_type_map.get(discharge_destination)
    if water_type is None:
        raise HTTPException(
            status_code=400,
            detail="discharge_destination must be 'environment' or 'public_sewer'",
        )

    filters = [TestCatalogItem.name.ilike(f"%{p}%") for p in params]
    items = (
        db.query(TestCatalogItem)
        .filter(
            TestCatalogItem.water_type == water_type,
            TestCatalogItem.is_active == True,  # noqa: E712
            or_(*filters),
        )
        .order_by(TestCatalogItem.sort_order, TestCatalogItem.name)
        .all()
    )
    return [CatalogItemOut.model_validate(i) for i in items]


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
    # Sort Order left at 0 means "not chosen" — slot the test into the default report order.
    if not item.sort_order and _uses_default_order(item.water_type):
        item.sort_order = default_sort_order(item.name)
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


class MoveRequest(BaseModel):
    direction: str  # "up" | "down"


@router.post("/{item_id}/move", response_model=dict)
def move_catalog_item(
    item_id: int,
    payload: MoveRequest,
    db: Session = Depends(get_db),
    _=Depends(require_role(UserRole.admin, UserRole.manager)),
):
    """Move a test one place up/down within its report group (same water type and
    category — the tests that print together), then renumber that group in steps of 10
    so positions stay distinct. Inactive tests are included so they keep their place."""
    if payload.direction not in ("up", "down"):
        raise HTTPException(status_code=422, detail="direction must be 'up' or 'down'")
    item = db.query(TestCatalogItem).filter(TestCatalogItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Catalog item not found")

    group = (
        db.query(TestCatalogItem)
        .filter(
            TestCatalogItem.water_type == item.water_type,
            TestCatalogItem.category == item.category,
        )
        .order_by(TestCatalogItem.sort_order, TestCatalogItem.name, TestCatalogItem.id)
        .all()
    )
    index = next(i for i, g in enumerate(group) if g.id == item.id)
    step = -1 if payload.direction == "up" else 1
    target = index + step
    # An active test steps past inactive ones — they're hidden in the catalog list by
    # default, so swapping with one would look like nothing happened.
    while item.is_active and 0 <= target < len(group) and not group[target].is_active:
        target += step
    moved = 0 <= target < len(group)
    if moved:
        group.insert(target, group.pop(index))
    for position, g in enumerate(group):
        g.sort_order = (position + 1) * 10
    db.commit()
    return {"moved": moved}


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_catalog_item(
    item_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_role(UserRole.admin, UserRole.manager)),
):
    item = db.query(TestCatalogItem).filter(TestCatalogItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Catalog item not found")

    # Test results carry the traceability of an issued report back to the catalog entry
    # it was measured against, so that entry must outlive them. A test that is no longer
    # offered is retired with is_active instead of being destroyed.
    result_count = (
        db.query(TestResult).filter(TestResult.catalog_item_id == item_id).count()
    )
    if result_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"'{item.name}' has {result_count} recorded test "
                f"result{'s' if result_count != 1 else ''} and cannot be deleted. "
                "Deactivate it instead to remove it from new sample requests."
            ),
        )

    # test_package_items.catalog_item_id has no DB-level constraint (see the note on the
    # model), so nothing stops this delete from leaving packages pointing at a missing
    # row. Check it here or the corruption is silent.
    package_names = [
        name
        for (name,) in db.query(TestPackage.name)
        .join(TestPackageItem, TestPackageItem.package_id == TestPackage.id)
        .filter(TestPackageItem.catalog_item_id == item_id)
        .distinct()
        .all()
    ]
    if package_names:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"'{item.name}' is part of the test package(s): {', '.join(package_names)}. "
                "Remove it from those packages first, or deactivate it instead."
            ),
        )

    try:
        db.delete(item)
        db.commit()
    except IntegrityError:
        # Anything else still referencing the row — surface it as a conflict rather than
        # letting it surface as an unexplained 500.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"'{item.name}' is still referenced by other records and cannot be "
                "deleted. Deactivate it instead."
            ),
        )


@router.post("/seed", response_model=dict)
def reseed_catalog(
    db: Session = Depends(get_db),
    _=Depends(require_role(UserRole.admin)),
):
    added = seed_catalog(db)
    return {"added": added, "message": f"Seeded {added} new catalog items."}


@router.post("/apply-default-order", response_model=dict)
def apply_default_order(
    db: Session = Depends(get_db),
    _=Depends(require_role(UserRole.admin)),
):
    """One-off: reset drinking-water tests to the default report order.
    Overwrites any manual Sort Order on those tests; waste schedules are untouched."""
    updated = apply_default_report_order(db)
    return {"updated": updated, "message": f"Applied default report order to {updated} catalog items."}
