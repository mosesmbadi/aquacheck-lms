from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user
from app.models.user import User, UserRole
from app.models.invoice import Invoice, InvoiceStatus
from app.models.customer import Customer
from app.models.sample import Sample
from app.schemas.invoice import InvoiceCreate, InvoiceUpdate, InvoiceOut
from app.services.audit import log_action

router = APIRouter(prefix="/invoices", tags=["Invoices"])


def _next_invoice_number(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    count = db.query(Invoice).filter(Invoice.invoice_number.like(f"INV-{year}-%")).count()
    return f"INV-{year}-{str(count + 1).zfill(5)}"


def _compute_totals(items: list, vat_rate: float):
    subtotal = sum(float(i.get("total", 0)) for i in items)
    vat_amount = round(subtotal * float(vat_rate) / 100, 2)
    total = round(subtotal + vat_amount, 2)
    return subtotal, vat_amount, total


def _serialize(inv: Invoice, db: Session) -> InvoiceOut:
    out = InvoiceOut.model_validate(inv)
    if inv.customer_id:
        c = db.query(Customer).filter(Customer.id == inv.customer_id).first()
        if c:
            out.customer_name = c.name
    if inv.sample_id:
        s = db.query(Sample).filter(Sample.id == inv.sample_id).first()
        if s:
            out.sample_code = s.sample_code
    return out


@router.get("", response_model=List[InvoiceOut])
def list_invoices(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Invoice)
    if current_user.role == UserRole.customer and current_user.customer_id:
        q = q.filter(Invoice.customer_id == current_user.customer_id)
    invoices = q.order_by(Invoice.created_at.desc()).all()
    return [_serialize(inv, db) for inv in invoices]


@router.post("", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
def create_invoice(
    payload: InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    subtotal, vat_amount, total = _compute_totals(payload.items, payload.vat_rate)
    inv = Invoice(
        invoice_number=_next_invoice_number(db),
        sample_id=payload.sample_id,
        customer_id=payload.customer_id,
        contract_id=payload.contract_id,
        items=payload.items,
        subtotal=subtotal,
        vat_rate=payload.vat_rate,
        vat_amount=vat_amount,
        total=total,
        currency=payload.currency,
        due_date=payload.due_date,
        notes=payload.notes,
        created_by=current_user.id,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    log_action(db, current_user.id, "CREATE_INVOICE", "invoice", str(inv.id))
    return _serialize(inv, db)


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if current_user.role == UserRole.customer and current_user.customer_id != inv.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return _serialize(inv, db)


@router.put("/{invoice_id}", response_model=InvoiceOut)
def update_invoice(
    invoice_id: int,
    payload: InvoiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.customer:
        raise HTTPException(status_code=403, detail="Customers cannot edit invoices")
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    update_data = payload.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(inv, k, v)

    items = inv.items or []
    vat_rate = float(inv.vat_rate)
    inv.subtotal, inv.vat_amount, inv.total = _compute_totals(items, vat_rate)

    db.commit()
    db.refresh(inv)
    log_action(db, current_user.id, "UPDATE_INVOICE", "invoice", str(invoice_id))
    return _serialize(inv, db)


@router.post("/{invoice_id}/issue", response_model=InvoiceOut)
def issue_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.customer:
        raise HTTPException(status_code=403, detail="Customers cannot issue invoices")
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    inv.status = InvoiceStatus.issued
    db.commit()
    db.refresh(inv)
    log_action(db, current_user.id, "ISSUE_INVOICE", "invoice", str(invoice_id))
    return _serialize(inv, db)


@router.post("/{invoice_id}/mark-paid", response_model=InvoiceOut)
def mark_paid(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.customer:
        raise HTTPException(status_code=403, detail="Customers cannot mark invoices as paid")
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    inv.status = InvoiceStatus.paid
    db.commit()
    db.refresh(inv)
    log_action(db, current_user.id, "MARK_INVOICE_PAID", "invoice", str(invoice_id))
    return _serialize(inv, db)
