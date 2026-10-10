import io
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas

_LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "images", "aquacheck logo.png")

PAGE_W, PAGE_H = A4

TEXT = colors.HexColor("#1E1E8C")
BORDER = colors.HexColor("#8A8AD0")
HEADER_BG = colors.HexColor("#E6E6E6")

LAB_ADDRESS = [
    "AQUACHECK LABORATORIES LTD",
    "Westlands commercial centre,Old block,1st",
    "Floor,Room No:4",
    "216-00300",
    "Westlands,Nairobi,",
]
LAB_KRA_PIN = "P051910076H"
LAB_PHONE = "0755596064"
LAB_EMAIL = "Info@aquachecklab.com"
LAB_WEBSITE = "www.aquachecklab.com"
PAYMENT_DETAILS = [
    "PAYMENT DETAILS",
    "Bank: stanbic Bank",
    "Branch: westgate branch",
    "A/C name: Aquacheck Laboratories ltd",
    "A/C No: 0100014162199",
    "Bank code:31",
    "Branch code: 012",
    "Swift code: SBICKENX",
    "Paybill : 600100",
    "A/C: 800041",
]

# Items table geometry (points, measured from the top of the page)
ITEMS_LEFT, ITEMS_RIGHT = 36, 560
ITEMS_HEAD_TOP, ITEMS_HEAD_BOTTOM, ITEMS_BOTTOM = 316, 340, 579
COL_QTY_END, COL_DESC_END, COL_RATE_END = 97, 361, 479
ROW_FONT_SIZE = 9
ROW_LEADING = 11


def _y(top: float) -> float:
    """Convert a distance from the top of the page to ReportLab's bottom-up y."""
    return PAGE_H - top


def _money(value) -> str:
    try:
        return f"{float(value):,.2f}"
    except (TypeError, ValueError):
        return "0.00"


def _qty(value) -> str:
    try:
        return f"{float(value):g}"
    except (TypeError, ValueError):
        return ""


def _box(c: Canvas, left, top, right, bottom, fill=None):
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.8)
    if fill is not None:
        c.setFillColor(fill)
    c.rect(left, _y(bottom), right - left, bottom - top, stroke=1, fill=1 if fill is not None else 0)
    c.setFillColor(TEXT)


def _labelled_boxes(c: Canvas, cells, top, mid, bottom, label_font=("Helvetica", 9), value_font=("Times-Roman", 9)):
    """Draw adjacent header/value box pairs: cells = [(left, right, label, value), ...]."""
    for left, right, label, value in cells:
        _box(c, left, top, right, mid)
        _box(c, left, mid, right, bottom)
        cx = (left + right) / 2
        c.setFont(*label_font)
        c.drawCentredString(cx, _y((top + mid) / 2 + 3), label)
        c.setFont(*value_font)
        c.drawCentredString(cx, _y((mid + bottom) / 2 + 3), value or "")


def _fit_font(text: str, font: str, size: float, max_width: float) -> float:
    while size > 6 and stringWidth(text, font, size) > max_width:
        size -= 0.5
    return size


def _build_rows(items, taxable: bool):
    desc_width = COL_DESC_END - COL_QTY_END - 8
    rows = []
    for item in items:
        name = str(item.get("name") or "")
        if item.get("package_name"):
            name = f"{item['package_name']}: {name}"
        lines = simpleSplit(name, "Times-Roman", ROW_FONT_SIZE, desc_width) or [""]
        amount = _money(item.get("total", 0)) + ("T" if taxable else "")
        rows.append({
            "qty": _qty(item.get("quantity", "")),
            "lines": lines,
            "rate": _money(item.get("unit_price", 0)),
            "amount": amount,
            "height": len(lines) * ROW_LEADING + 4,
        })
    return rows


def _paginate(rows):
    capacity = ITEMS_BOTTOM - ITEMS_HEAD_BOTTOM - 6
    pages, current, used = [], [], 0
    for row in rows:
        if current and used + row["height"] > capacity:
            pages.append(current)
            current, used = [], 0
        current.append(row)
        used += row["height"]
    pages.append(current)
    return pages


def _draw_header(c: Canvas, invoice_date: str, invoice_number: str):
    logo_path = os.path.normpath(_LOGO_PATH)
    if os.path.isfile(logo_path):
        c.drawImage(logo_path, 39, _y(80), width=180, height=56, preserveAspectRatio=True, anchor="w", mask="auto")
    else:
        c.setFillColor(TEXT)
        c.setFont("Helvetica-Bold", 22)
        c.drawString(39, _y(58), "Aquacheck")

    c.setFillColor(TEXT)
    c.setFont("Helvetica-Bold", 20)
    c.drawRightString(556, _y(48), "INVOICE")

    number_size = _fit_font(invoice_number, "Times-Roman", 9, 560 - 488 - 6)
    _labelled_boxes(c, [(411, 488, "Date", invoice_date)], 67, 81, 103)
    _labelled_boxes(c, [(488, 560, "Invoice #", invoice_number)], 67, 81, 103,
                    value_font=("Times-Roman", number_size))

    c.setFont("Times-Roman", 12)
    for i, line in enumerate(LAB_ADDRESS):
        c.drawString(39, _y(102 + i * 15), line)


def _draw_bill_to(c: Canvas, customer):
    _box(c, 36, 181, 267, 199)
    c.setFont("Helvetica", 9)
    c.drawString(48, _y(193), "Bill To")
    _box(c, 36, 204, 267, 253)
    lines = []
    if customer:
        lines.append(customer.name or "")
        if customer.address:
            lines.extend(customer.address.splitlines())
    c.setFont("Times-Roman", 9)
    y = 214
    for raw in lines:
        for line in simpleSplit(raw, "Times-Roman", 9, 267 - 36 - 10):
            if y > 250:
                return
            c.drawString(41, _y(y), line)
            y += 11


def _draw_terms(c: Canvas, po_number: str, terms: str, due_date: str):
    _labelled_boxes(c, [(36, 171, "KRA  PIN", LAB_KRA_PIN)], 262, 280, 312)
    _labelled_boxes(c, [
        (230, 411, "P.O. No.", po_number),
        (411, 479, "Terms", terms),
        (479, 560, "Due Date", due_date),
    ], 262, 280, 312)


def _draw_items(c: Canvas, rows):
    _box(c, ITEMS_LEFT, ITEMS_HEAD_TOP, ITEMS_RIGHT, ITEMS_HEAD_BOTTOM, fill=HEADER_BG)
    _box(c, ITEMS_LEFT, ITEMS_HEAD_BOTTOM, ITEMS_RIGHT, ITEMS_BOTTOM)
    c.setStrokeColor(BORDER)
    for x in (COL_QTY_END, COL_DESC_END, COL_RATE_END):
        c.line(x, _y(ITEMS_HEAD_TOP), x, _y(ITEMS_BOTTOM))

    head_y = _y((ITEMS_HEAD_TOP + ITEMS_HEAD_BOTTOM) / 2 + 3)
    c.setFont("Helvetica", 9)
    c.drawCentredString((ITEMS_LEFT + COL_QTY_END) / 2, head_y, "Quantity")
    c.drawCentredString((COL_QTY_END + COL_DESC_END) / 2, head_y, "Description")
    c.drawCentredString((COL_DESC_END + COL_RATE_END) / 2, head_y, "Rate")
    c.drawCentredString((COL_RATE_END + ITEMS_RIGHT) / 2, head_y, "Amount")

    c.setFont("Times-Roman", ROW_FONT_SIZE)
    top = ITEMS_HEAD_BOTTOM + 3
    for row in rows:
        baseline = _y(top + ROW_FONT_SIZE)
        c.drawRightString(COL_QTY_END - 4, baseline, row["qty"])
        c.drawRightString(COL_RATE_END - 4, baseline, row["rate"])
        c.drawRightString(ITEMS_RIGHT - 4, baseline, row["amount"])
        for i, line in enumerate(row["lines"]):
            c.drawString(COL_QTY_END + 4, baseline - i * ROW_LEADING, line)
        top += row["height"]


def _draw_totals(c: Canvas, invoice, currency: str):
    vat_rate = float(invoice.vat_rate or 0)
    totals = [
        ("Subtotal", invoice.subtotal, 579, 610, 13),
        (f"Sales Tax  ({vat_rate:.1f}%)", invoice.vat_amount, 610, 637, 13),
        ("Total", invoice.total, 637, 665, 17),
    ]
    for label, value, top, bottom, size in totals:
        _box(c, COL_DESC_END, top, ITEMS_RIGHT, bottom)
        baseline = _y((top + bottom) / 2 + size / 3)
        c.setFont("Helvetica-Bold", size)
        c.drawString(COL_DESC_END + 12, baseline, label)
        c.setFont("Times-Roman", 9)
        c.drawRightString(ITEMS_RIGHT - 8, _y((top + bottom) / 2 + 3), f"{currency} {_money(value)}")

    c.setFont("Times-Roman", 9)
    for i, line in enumerate(PAYMENT_DETAILS):
        c.drawString(43, _y(600 + i * 10.6), line)


def _draw_footer(c: Canvas):
    _box(c, 162, 723, 353, 746)
    c.setFont("Times-Roman", 9)
    c.drawString(166, _y(737), "We look forward to recieving your payment.")
    _labelled_boxes(c, [
        (36, 136, "Phone #", LAB_PHONE),
        (176, 335, "E-mail", LAB_EMAIL),
        (379, 560, "Web Site", LAB_WEBSITE),
    ], 746, 769, 791)


def build_invoice_pdf(invoice, customer) -> bytes:
    buffer = io.BytesIO()
    c = Canvas(buffer, pagesize=A4)
    c.setTitle(f"Invoice {invoice.invoice_number}")

    currency = invoice.currency or "KES"
    issued = invoice.created_at.date() if invoice.created_at else None
    invoice_date = issued.strftime("%d/%m/%Y") if issued else ""
    due = invoice.due_date or issued
    due_date = due.strftime("%d/%m/%Y") if due else ""
    if invoice.due_date and issued and invoice.due_date > issued:
        terms = f"Net {(invoice.due_date - issued).days}"
    else:
        terms = "Due on receipt"

    taxable = float(invoice.vat_rate or 0) > 0
    pages = _paginate(_build_rows(invoice.items or [], taxable))

    for index, rows in enumerate(pages):
        c.setFillColor(TEXT)
        _draw_header(c, invoice_date, invoice.invoice_number)
        _draw_bill_to(c, customer)
        _draw_terms(c, invoice.po_number or "", terms, due_date)
        _draw_items(c, rows)
        if index == len(pages) - 1:
            _draw_totals(c, invoice, currency)
        else:
            c.setFont("Times-Italic", 9)
            c.drawRightString(ITEMS_RIGHT, _y(592), "Continued on next page")
        _draw_footer(c)
        if len(pages) > 1:
            c.setFont("Times-Roman", 8)
            c.drawCentredString(PAGE_W / 2, _y(815), f"Page {index + 1} of {len(pages)}")
        c.showPage()

    c.save()
    return buffer.getvalue()
