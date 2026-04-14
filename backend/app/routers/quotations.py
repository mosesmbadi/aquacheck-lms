import os
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
import io
from sqlalchemy.orm import Session

from app.deps import get_db, get_current_user, require_role
from app.models.user import User, UserRole
from app.models.customer import Customer
from app.models.quotation import Quotation, QuotationStatus
from app.schemas.quotation import (
    QuotationCreate, QuotationUpdate, QuotationOut, QuotationSendRequest, QuotationItem,
)
from app.services.audit import log_action
from app.services.email import send_email, EmailConfigError
from app.services.quotation_pdf import build_quotation_pdf

router = APIRouter(prefix="/quotations", tags=["Quotations"])


def _default_vat() -> float:
    try:
        return float(os.getenv("DEFAULT_VAT_RATE", "16"))
    except ValueError:
        return 16.0


def _next_quote_number(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    max_seq = 0
    for (code,) in db.query(Quotation.quote_number).filter(Quotation.quote_number.like("QTN/%/%")).all():
        try:
            seq = int(code.split("/")[1])
            if seq > max_seq:
                max_seq = seq
        except (IndexError, ValueError):
            continue
    return f"QTN/{max_seq + 1}/{year}"


def _compute_totals(items: List[QuotationItem], vat_rate: float):
    normalized = []
    subtotal = 0.0
    for item in items:
        qty = float(item.quantity or 0)
        price = float(item.unit_price or 0)
        total = round(qty * price, 2)
        subtotal += total
        normalized.append({
            "catalog_item_id": item.catalog_item_id,
            "name": item.name,
            "unit": item.unit,
            "quantity": qty,
            "unit_price": price,
            "total": total,
        })
    subtotal = round(subtotal, 2)
    vat_amount = round(subtotal * (vat_rate / 100.0), 2)
    total = round(subtotal + vat_amount, 2)
    return normalized, subtotal, vat_amount, total


def _to_out(q: Quotation) -> QuotationOut:
    return QuotationOut(
        id=q.id,
        quote_number=q.quote_number,
        customer_id=q.customer_id,
        customer_name=q.customer.name if q.customer else None,
        items=[QuotationItem(**i) for i in (q.items or [])],
        subtotal=float(q.subtotal or 0),
        vat_rate=float(q.vat_rate or 0),
        vat_amount=float(q.vat_amount or 0),
        total=float(q.total or 0),
        currency=q.currency or "KES",
        status=q.status,
        valid_until=q.valid_until,
        notes=q.notes,
        terms=q.terms,
        sent_to=q.sent_to,
        sent_at=q.sent_at,
        created_at=q.created_at,
        updated_at=q.updated_at,
    )


@router.get("", response_model=List[QuotationOut])
def list_quotations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.customer:
        raise HTTPException(status_code=403, detail="Not permitted")
    rows = db.query(Quotation).order_by(Quotation.created_at.desc()).all()
    return [_to_out(q) for q in rows]


@router.post("", response_model=QuotationOut, status_code=status.HTTP_201_CREATED)
def create_quotation(
    payload: QuotationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.manager, UserRole.technician)),
):
    customer = db.query(Customer).filter(Customer.id == payload.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    vat_rate = payload.vat_rate if payload.vat_rate is not None else _default_vat()
    items, subtotal, vat_amount, total = _compute_totals(payload.items, vat_rate)
    currency = payload.currency or customer.currency or "KES"

    quote = Quotation(
        quote_number=_next_quote_number(db),
        customer_id=customer.id,
        items=items,
        subtotal=subtotal,
        vat_rate=vat_rate,
        vat_amount=vat_amount,
        total=total,
        currency=currency,
        valid_until=payload.valid_until,
        notes=payload.notes,
        terms=payload.terms,
        status=QuotationStatus.draft,
        created_by=current_user.id,
    )
    db.add(quote)
    db.commit()
    db.refresh(quote)
    log_action(db, current_user.id, "CREATE_QUOTATION", "quotation", str(quote.id))
    return _to_out(quote)


@router.get("/{quote_id}", response_model=QuotationOut)
def get_quotation(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    quote = db.query(Quotation).filter(Quotation.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return _to_out(quote)


@router.put("/{quote_id}", response_model=QuotationOut)
def update_quotation(
    quote_id: int,
    payload: QuotationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.manager, UserRole.technician)),
):
    quote = db.query(Quotation).filter(Quotation.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Quotation not found")

    data = payload.model_dump(exclude_unset=True)
    if "items" in data or "vat_rate" in data:
        items_src = payload.items if payload.items is not None else [QuotationItem(**i) for i in (quote.items or [])]
        vat_rate = payload.vat_rate if payload.vat_rate is not None else float(quote.vat_rate or 0)
        items, subtotal, vat_amount, total = _compute_totals(items_src, vat_rate)
        quote.items = items
        quote.vat_rate = vat_rate
        quote.subtotal = subtotal
        quote.vat_amount = vat_amount
        quote.total = total

    for field in ("currency", "valid_until", "notes", "terms", "status"):
        if field in data:
            setattr(quote, field, data[field])

    db.commit()
    db.refresh(quote)
    log_action(db, current_user.id, "UPDATE_QUOTATION", "quotation", str(quote.id))
    return _to_out(quote)


@router.delete("/{quote_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_quotation(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.manager)),
):
    quote = db.query(Quotation).filter(Quotation.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Quotation not found")
    db.delete(quote)
    db.commit()
    log_action(db, current_user.id, "DELETE_QUOTATION", "quotation", str(quote_id))


@router.get("/{quote_id}/pdf")
def quotation_pdf(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    quote = db.query(Quotation).filter(Quotation.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Quotation not found")
    customer = db.query(Customer).filter(Customer.id == quote.customer_id).first()
    pdf_bytes = build_quotation_pdf(quote, customer)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={quote.quote_number.replace('/', '_')}.pdf"},
    )


@router.post("/{quote_id}/send", response_model=QuotationOut)
def send_quotation(
    quote_id: int,
    payload: QuotationSendRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.manager, UserRole.technician)),
):
    quote = db.query(Quotation).filter(Quotation.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Quotation not found")
    customer = db.query(Customer).filter(Customer.id == quote.customer_id).first()

    recipients = payload.to or ([customer.email] if customer and customer.email else [])
    recipients = [r for r in recipients if r]
    if not recipients:
        raise HTTPException(status_code=400, detail="No recipient email address available")

    subject = payload.subject or f"Quotation {quote.quote_number} from AquaCheck Laboratories"
    body = payload.message or (
        f"Dear {customer.contact_person or customer.name if customer else 'Customer'},\n\n"
        f"Please find attached our quotation {quote.quote_number}.\n\n"
        f"Total: {quote.currency} {float(quote.total):,.2f}\n"
        f"{'Valid until: ' + quote.valid_until.strftime('%d/%m/%Y') + chr(10) if quote.valid_until else ''}"
        f"\nRegards,\nAquaCheck Laboratories Ltd"
    )

    pdf_bytes = build_quotation_pdf(quote, customer)
    filename = f"{quote.quote_number.replace('/', '_')}.pdf"

    try:
        send_email(
            to=recipients,
            subject=subject,
            body=body,
            attachments=[(filename, pdf_bytes, "application/pdf")],
        )
    except EmailConfigError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to send email: {e}")

    quote.status = QuotationStatus.sent
    quote.sent_to = ", ".join(recipients)
    quote.sent_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(quote)
    log_action(db, current_user.id, "SEND_QUOTATION", "quotation", str(quote.id))
    return _to_out(quote)
