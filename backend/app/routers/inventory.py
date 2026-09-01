import csv
import io
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.deps import get_db, get_current_user
from app.models.user import User
from app.models.inventory import (
    InventoryItem, InventoryTransaction, InventoryCategory, TransactionType,
    TestReagentUsage,
)
from app.models.test_catalog import TestCatalogItem
from app.schemas.inventory import (
    InventoryItemCreate, InventoryItemUpdate, InventoryItemOut,
    InventoryTransactionCreate, InventoryTransactionOut, InventoryStats,
    TestReagentUsageCreate, TestReagentUsageOut, CsvImportResult,
)
from app.services.audit import log_action

router = APIRouter(prefix="/inventory", tags=["Inventory"])


# ── helpers ───────────────────────────────────────────────────────────────────

_INCOMING = {TransactionType.receive, TransactionType.return_stock}
_OUTGOING = {TransactionType.use, TransactionType.dispose}


def _signed_delta(tx_type: TransactionType, quantity: float) -> float:
    """Convert an unsigned quantity + transaction type into a signed stock delta."""
    qty = abs(quantity)
    if tx_type in _INCOMING:
        return qty
    if tx_type in _OUTGOING:
        return -qty
    # adjust: quantity is treated as signed exactly as provided
    return quantity


def _serialize_item(item: InventoryItem) -> InventoryItemOut:
    data = InventoryItemOut.model_validate(item)
    data.is_low_stock = item.current_stock <= item.minimum_stock
    return data


def _serialize_tx(tx: InventoryTransaction) -> InventoryTransactionOut:
    out = InventoryTransactionOut.model_validate(tx)
    if tx.item:
        out.item_name = tx.item.name
        out.item_code = tx.item.item_code
        out.item_unit = tx.item.unit
    return out


# ── stats / alerts ────────────────────────────────────────────────────────────

@router.get("/stats", response_model=InventoryStats)
def inventory_stats(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    items = db.query(InventoryItem).filter(InventoryItem.is_active == 1).all()
    low = sum(1 for i in items if i.current_stock <= i.minimum_stock)

    soon = date.today() + timedelta(days=30)
    expiring = (
        db.query(func.count(func.distinct(InventoryTransaction.item_id)))
        .filter(InventoryTransaction.expiry_date != None)  # noqa: E711
        .filter(InventoryTransaction.expiry_date <= soon)
        .filter(InventoryTransaction.transaction_type == TransactionType.receive)
        .scalar() or 0
    )

    total_value = sum(
        (i.current_stock * (i.unit_cost or 0.0)) for i in items
    )

    return InventoryStats(
        total_items=len(items),
        low_stock_count=low,
        expiring_soon_count=int(expiring),
        total_value=round(total_value, 2),
    )


@router.get("/low-stock", response_model=List[InventoryItemOut])
def low_stock(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    items = (
        db.query(InventoryItem)
        .filter(InventoryItem.is_active == 1)
        .filter(InventoryItem.current_stock <= InventoryItem.minimum_stock)
        .order_by(InventoryItem.name.asc())
        .all()
    )
    return [_serialize_item(i) for i in items]


# ── items ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[InventoryItemOut])
def list_items(
    category: Optional[InventoryCategory] = None,
    search: Optional[str] = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(InventoryItem)
    if active_only:
        q = q.filter(InventoryItem.is_active == 1)
    if category:
        q = q.filter(InventoryItem.category == category)
    if search:
        like = f"%{search}%"
        q = q.filter(
            (InventoryItem.name.ilike(like))
            | (InventoryItem.item_code.ilike(like))
            | (InventoryItem.catalog_number.ilike(like))
        )
    items = q.order_by(InventoryItem.name.asc()).all()
    return [_serialize_item(i) for i in items]


@router.post("", response_model=InventoryItemOut, status_code=status.HTTP_201_CREATED)
def create_item(
    payload: InventoryItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if db.query(InventoryItem).filter(InventoryItem.item_code == payload.item_code).first():
        raise HTTPException(status_code=409, detail="Item code already exists")

    data = payload.model_dump(exclude={"opening_stock"})
    item = InventoryItem(**data, current_stock=0.0)
    db.add(item)
    db.flush()

    if payload.opening_stock and payload.opening_stock > 0:
        tx = InventoryTransaction(
            item_id=item.id,
            transaction_type=TransactionType.receive,
            quantity=payload.opening_stock,
            balance_after=payload.opening_stock,
            transaction_date=date.today(),
            performed_by=current_user.id,
            notes="Opening stock",
        )
        db.add(tx)
        item.current_stock = payload.opening_stock

    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "CREATE_INVENTORY_ITEM", "inventory_item", str(item.id))
    return _serialize_item(item)


@router.get("/{item_id}", response_model=InventoryItemOut)
def get_item(item_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return _serialize_item(item)


@router.put("/{item_id}", response_model=InventoryItemOut)
def update_item(
    item_id: int,
    payload: InventoryItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "UPDATE_INVENTORY_ITEM", "inventory_item", str(item_id))
    return _serialize_item(item)


@router.delete("/{item_id}", status_code=204)
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    # Soft delete to preserve ledger integrity
    item.is_active = 0
    db.commit()
    log_action(db, current_user.id, "DEACTIVATE_INVENTORY_ITEM", "inventory_item", str(item_id))
    return


# ── transactions (ledger) ─────────────────────────────────────────────────────

@router.get("/{item_id}/transactions", response_model=List[InventoryTransactionOut])
def list_item_transactions(
    item_id: int,
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    txs = (
        db.query(InventoryTransaction)
        .filter(InventoryTransaction.item_id == item_id)
        .order_by(InventoryTransaction.transaction_date.desc(), InventoryTransaction.id.desc())
        .limit(limit)
        .all()
    )
    return [_serialize_tx(t) for t in txs]


@router.get("/transactions/recent", response_model=List[InventoryTransactionOut])
def recent_transactions(
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    txs = (
        db.query(InventoryTransaction)
        .order_by(InventoryTransaction.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_serialize_tx(t) for t in txs]


@router.post("/transactions", response_model=InventoryTransactionOut, status_code=201)
def create_transaction(
    payload: InventoryTransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(InventoryItem).filter(InventoryItem.id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    delta = _signed_delta(payload.transaction_type, payload.quantity)
    new_balance = item.current_stock + delta

    if new_balance < 0:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient stock. Current: {item.current_stock} {item.unit}, "
                f"requested: {abs(delta)} {item.unit}"
            ),
        )

    tx = InventoryTransaction(
        item_id=item.id,
        transaction_type=payload.transaction_type,
        quantity=delta,
        balance_after=new_balance,
        transaction_date=payload.transaction_date or date.today(),
        lot_number=payload.lot_number,
        expiry_date=payload.expiry_date,
        supplier=payload.supplier,
        reference=payload.reference,
        related_sample_id=payload.related_sample_id,
        related_test_result_id=payload.related_test_result_id,
        performed_by=current_user.id,
        notes=payload.notes,
    )
    item.current_stock = new_balance
    db.add(tx)
    db.commit()
    db.refresh(tx)
    log_action(
        db, current_user.id,
        f"INVENTORY_{payload.transaction_type.value.upper()}",
        "inventory_transaction", str(tx.id),
    )
    return _serialize_tx(tx)


# ── test-reagent usage mapping ────────────────────────────────────────────────

def _serialize_mapping(m: TestReagentUsage, db: Session) -> TestReagentUsageOut:
    out = TestReagentUsageOut.model_validate(m)
    if m.inventory_item:
        out.inventory_item_name = m.inventory_item.name
        out.inventory_item_code = m.inventory_item.item_code
        out.inventory_unit = m.inventory_item.unit
        out.current_stock = m.inventory_item.current_stock
    catalog = db.query(TestCatalogItem).filter(TestCatalogItem.id == m.catalog_item_id).first()
    if catalog:
        out.catalog_item_name = catalog.name
    return out


@router.get("/test-usage", response_model=List[TestReagentUsageOut])
def list_test_reagent_usage(
    catalog_item_id: Optional[int] = None,
    inventory_item_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(TestReagentUsage)
    if catalog_item_id is not None:
        q = q.filter(TestReagentUsage.catalog_item_id == catalog_item_id)
    if inventory_item_id is not None:
        q = q.filter(TestReagentUsage.inventory_item_id == inventory_item_id)
    return [_serialize_mapping(m, db) for m in q.order_by(TestReagentUsage.id.desc()).all()]


@router.post("/test-usage", response_model=TestReagentUsageOut, status_code=201)
def create_test_reagent_usage(
    payload: TestReagentUsageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.query(TestCatalogItem).filter(TestCatalogItem.id == payload.catalog_item_id).first():
        raise HTTPException(status_code=404, detail="Catalog item not found")
    if not db.query(InventoryItem).filter(InventoryItem.id == payload.inventory_item_id).first():
        raise HTTPException(status_code=404, detail="Inventory item not found")

    existing = (
        db.query(TestReagentUsage)
        .filter(
            TestReagentUsage.catalog_item_id == payload.catalog_item_id,
            TestReagentUsage.inventory_item_id == payload.inventory_item_id,
        )
        .first()
    )
    if existing:
        existing.quantity_per_test = payload.quantity_per_test
        existing.notes = payload.notes
        db.commit()
        db.refresh(existing)
        log_action(db, current_user.id, "UPDATE_TEST_REAGENT_USAGE", "test_reagent_usage", str(existing.id))
        return _serialize_mapping(existing, db)

    m = TestReagentUsage(**payload.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    log_action(db, current_user.id, "CREATE_TEST_REAGENT_USAGE", "test_reagent_usage", str(m.id))
    return _serialize_mapping(m, db)


@router.delete("/test-usage/{mapping_id}", status_code=204)
def delete_test_reagent_usage(
    mapping_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = db.query(TestReagentUsage).filter(TestReagentUsage.id == mapping_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Mapping not found")
    db.delete(m)
    db.commit()
    log_action(db, current_user.id, "DELETE_TEST_REAGENT_USAGE", "test_reagent_usage", str(mapping_id))
    return


# ── CSV export ────────────────────────────────────────────────────────────────

_ITEM_CSV_COLUMNS = [
    "item_code", "name", "category", "unit", "current_stock", "minimum_stock",
    "supplier", "catalog_number", "storage_location", "storage_conditions",
    "unit_cost", "expiry_date", "description", "notes",
]


@router.get("/export/items.csv")
def export_items_csv(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    items = db.query(InventoryItem).order_by(InventoryItem.name.asc()).all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(_ITEM_CSV_COLUMNS)
    for i in items:
        writer.writerow([
            i.item_code, i.name, i.category.value if i.category else "",
            i.unit, i.current_stock, i.minimum_stock,
            i.supplier or "", i.catalog_number or "",
            i.storage_location or "", i.storage_conditions or "",
            i.unit_cost if i.unit_cost is not None else "",
            i.expiry_date.isoformat() if i.expiry_date else "",
            (i.description or "").replace("\n", " "),
            (i.notes or "").replace("\n", " "),
        ])
    buf.seek(0)
    filename = f"inventory_items_{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/transactions.csv")
def export_transactions_csv(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    txs = (
        db.query(InventoryTransaction)
        .order_by(InventoryTransaction.transaction_date.desc(), InventoryTransaction.id.desc())
        .all()
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "transaction_date", "item_code", "item_name", "type",
        "quantity", "balance_after", "unit", "lot_number", "expiry_date",
        "supplier", "reference", "notes",
    ])
    for t in txs:
        writer.writerow([
            t.transaction_date.isoformat() if t.transaction_date else "",
            t.item.item_code if t.item else "",
            t.item.name if t.item else "",
            t.transaction_type.value,
            t.quantity,
            t.balance_after,
            t.item.unit if t.item else "",
            t.lot_number or "",
            t.expiry_date.isoformat() if t.expiry_date else "",
            t.supplier or "",
            t.reference or "",
            (t.notes or "").replace("\n", " "),
        ])
    buf.seek(0)
    filename = f"inventory_ledger_{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/template.csv")
def export_import_template(_: User = Depends(get_current_user)):
    """Blank CSV template the client can fill in from their handwritten records."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "item_code", "name", "category", "unit", "opening_stock", "minimum_stock",
        "supplier", "catalog_number", "storage_location", "storage_conditions",
        "unit_cost", "expiry_date", "description",
    ])
    writer.writerow([
        "RG-001", "Nitric Acid 65%", "reagent", "mL", "2500", "500",
        "Loba", "LC-4421", "Shelf A2", "Room temp", "1.20", "2027-12-31",
        "AR grade, used in metals digestion",
    ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="inventory_import_template.csv"'},
    )


# ── CSV import ────────────────────────────────────────────────────────────────

_VALID_CATEGORIES = {c.value for c in InventoryCategory}


def _parse_float(value: str) -> Optional[float]:
    value = (value or "").strip()
    if not value:
        return None
    return float(value)


def _parse_date(value: str) -> Optional[date]:
    value = (value or "").strip()
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


@router.post("/import/items", response_model=CsvImportResult)
async def import_items_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk-import items from a CSV. Matches on item_code: existing → update,
    new → create. For new items, opening_stock seeds a receive transaction.
    Existing items' current_stock is never overwritten by import (use stock
    movements for that)."""
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")

    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    required = {"item_code", "name", "unit"}
    missing = required - set(h.strip() for h in (reader.fieldnames or []))
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"CSV missing required columns: {', '.join(sorted(missing))}",
        )

    created = updated = skipped = 0
    errors: list[str] = []

    for idx, row in enumerate(reader, start=2):  # row 1 is header
        code = (row.get("item_code") or "").strip()
        name = (row.get("name") or "").strip()
        unit = (row.get("unit") or "").strip()
        if not code or not name or not unit:
            errors.append(f"Row {idx}: item_code, name, unit are required")
            skipped += 1
            continue

        category_raw = (row.get("category") or "reagent").strip().lower()
        if category_raw not in _VALID_CATEGORIES:
            errors.append(f"Row {idx}: invalid category '{category_raw}'")
            skipped += 1
            continue

        try:
            min_stock = _parse_float(row.get("minimum_stock", "")) or 0.0
            opening_stock = _parse_float(row.get("opening_stock", "")) or 0.0
            unit_cost = _parse_float(row.get("unit_cost", ""))
        except ValueError as e:
            errors.append(f"Row {idx}: numeric parse error — {e}")
            skipped += 1
            continue

        existing = db.query(InventoryItem).filter(InventoryItem.item_code == code).first()

        fields = {
            "name": name,
            "category": InventoryCategory(category_raw),
            "unit": unit,
            "minimum_stock": min_stock,
            "supplier": (row.get("supplier") or "").strip() or None,
            "catalog_number": (row.get("catalog_number") or "").strip() or None,
            "storage_location": (row.get("storage_location") or "").strip() or None,
            "storage_conditions": (row.get("storage_conditions") or "").strip() or None,
            "unit_cost": unit_cost,
            "description": (row.get("description") or "").strip() or None,
            "expiry_date": _parse_date(row.get("expiry_date", "")),
        }

        if existing:
            for k, v in fields.items():
                setattr(existing, k, v)
            updated += 1
        else:
            item = InventoryItem(item_code=code, current_stock=0.0, **fields)
            db.add(item)
            db.flush()
            if opening_stock > 0:
                tx = InventoryTransaction(
                    item_id=item.id,
                    transaction_type=TransactionType.receive,
                    quantity=opening_stock,
                    balance_after=opening_stock,
                    transaction_date=date.today(),
                    performed_by=current_user.id,
                    notes="Opening stock (CSV import)",
                )
                db.add(tx)
                item.current_stock = opening_stock
            created += 1

    db.commit()
    log_action(
        db, current_user.id, "IMPORT_INVENTORY_CSV", "inventory_item",
        f"created={created} updated={updated} skipped={skipped}",
    )
    return CsvImportResult(created=created, updated=updated, skipped=skipped, errors=errors[:50])


# ── auto-deduct service (called from test_results router) ────────────────────

def deduct_reagents_for_test_result(
    db: Session,
    test_result_id: int,
    catalog_item_id: Optional[int],
    performed_by: Optional[int],
) -> dict:
    """Apply stock deductions for a completed test result based on the
    TestReagentUsage mapping. Idempotent: skips if this test result already
    has deduction transactions. Best-effort: logs and skips lines with
    insufficient stock rather than blocking the test entry.

    Returns: {"deducted": [...], "skipped": [...]}"""
    if catalog_item_id is None:
        return {"deducted": [], "skipped": []}

    already = (
        db.query(InventoryTransaction)
        .filter(InventoryTransaction.related_test_result_id == test_result_id)
        .first()
    )
    if already:
        return {"deducted": [], "skipped": []}

    mappings = (
        db.query(TestReagentUsage)
        .filter(TestReagentUsage.catalog_item_id == catalog_item_id)
        .all()
    )
    if not mappings:
        return {"deducted": [], "skipped": []}

    deducted: list[dict] = []
    skipped: list[dict] = []

    for m in mappings:
        item = db.query(InventoryItem).filter(InventoryItem.id == m.inventory_item_id).first()
        if not item or not item.is_active:
            skipped.append({"item_id": m.inventory_item_id, "reason": "inactive/missing"})
            continue
        qty = abs(m.quantity_per_test)
        new_balance = item.current_stock - qty
        if new_balance < 0:
            skipped.append({
                "item_id": item.id,
                "item_code": item.item_code,
                "reason": "insufficient_stock",
                "current": item.current_stock,
                "needed": qty,
            })
            continue
        tx = InventoryTransaction(
            item_id=item.id,
            transaction_type=TransactionType.use,
            quantity=-qty,
            balance_after=new_balance,
            transaction_date=date.today(),
            reference=f"TR-{test_result_id}",
            related_test_result_id=test_result_id,
            performed_by=performed_by,
            notes="Auto-deduction from test result",
        )
        item.current_stock = new_balance
        db.add(tx)
        deducted.append({
            "item_id": item.id,
            "item_code": item.item_code,
            "qty": qty,
            "unit": item.unit,
            "balance_after": new_balance,
        })

    return {"deducted": deducted, "skipped": skipped}
