import io
import os
from xml.sax.saxutils import escape
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage
from reportlab.lib.styles import ParagraphStyle

_LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "images", "aquacheck logo.png")

# Laid out after the lab's existing quote template: navy text, lavender rules.
NAVY = colors.HexColor("#1a237e")
BORDER = colors.HexColor("#8c8ccc")
HEADER_BG = colors.HexColor("#e5e5e5")

PAGE_WIDTH = 18 * cm
# Description | Qty | Rate | Total
ITEM_COLS = [10.5 * cm, 1.3 * cm, 3.1 * cm, 3.1 * cm]

COMPANY_NAME = "AQUACHECK LABORATORIES LTD"
COMPANY_ADDRESS = "Westlands commercial centre, Old block, 1st Floor, Room No:4<br/>216-00300<br/>Westlands, Nairobi"
COMPANY_PHONE = "0755596064"
COMPANY_EMAIL = "Info@aquachecklab.com"
COMPANY_WEBSITE = "www.aquachecklab.com"

ORDER_MESSAGE = "We look forward to receiving your Order"


def _fmt_amount(value) -> str:
    try:
        return f"{float(value):,.2f}"
    except (TypeError, ValueError):
        return "0.00"


def _fmt_money(value, currency: str) -> str:
    return f"{currency} {_fmt_amount(value)}"


def _text(value) -> str:
    """Escape free text for a Paragraph, keeping its line breaks."""
    return escape(str(value or "")).replace("\n", "<br/>")


def build_quotation_pdf(quotation, customer) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=1.5 * cm, rightMargin=1.5 * cm, topMargin=1.2 * cm, bottomMargin=1.2 * cm,
    )
    story = []

    body = ParagraphStyle("body", fontName="Times-Roman", fontSize=9, leading=11, textColor=NAVY)
    body_right = ParagraphStyle("body_right", parent=body, alignment=2)
    body_center = ParagraphStyle("body_center", parent=body, alignment=1)
    label = ParagraphStyle("label", fontName="Helvetica", fontSize=9, leading=11, textColor=NAVY, alignment=1)
    label_left = ParagraphStyle("label_left", parent=label, alignment=0)
    title_style = ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=NAVY, alignment=2)
    company_name_style = ParagraphStyle("company_name", fontName="Times-Roman", fontSize=12, leading=15, textColor=NAVY)
    company_addr_style = ParagraphStyle("company_addr", fontName="Times-Roman", fontSize=11, leading=14, textColor=NAVY)
    totals_label = ParagraphStyle("totals_label", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=NAVY)
    total_label = ParagraphStyle("total_label", parent=totals_label, fontSize=15, leading=18)

    currency = quotation.currency or "KES"
    issued_on = quotation.created_at.strftime("%d/%m/%Y") if quotation.created_at else "—"
    valid_until = quotation.valid_until.strftime("%d/%m/%Y") if quotation.valid_until else None

    # ── Header: logo + lab address on the left, title + Date/Quote# box on the right ──
    logo_path = os.path.normpath(_LOGO_PATH)
    if os.path.isfile(logo_path):
        logo = RLImage(logo_path, width=5.5 * cm, height=2 * cm, kind="proportional")
    else:
        logo = Paragraph("<b>AQUACHECK</b>", title_style)

    meta_header = [Paragraph("Date", label), Paragraph("Quote#", label)]
    meta_values = [Paragraph(issued_on, body_center), Paragraph(_text(quotation.quote_number), body_center)]
    if valid_until:
        meta_header.append(Paragraph("Valid Until", label))
        meta_values.append(Paragraph(valid_until, body_center))
    meta_col = 2.6 * cm if valid_until else 3.2 * cm
    meta_box = Table([meta_header, meta_values], colWidths=[meta_col] * len(meta_header), hAlign="RIGHT")
    meta_box.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.75, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    company = [
        Spacer(1, 0.3 * cm),
        Paragraph(COMPANY_NAME, company_name_style),
        Spacer(1, 0.1 * cm),
        Paragraph(COMPANY_ADDRESS, company_addr_style),
    ]
    header = Table(
        [[[logo] + company, [Paragraph("Quotation", title_style), Spacer(1, 0.2 * cm), meta_box]]],
        colWidths=[9 * cm, 9 * cm],
    )
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        # Cell alignment decides where the nested meta box sits; push it flush right under the title.
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header)
    story.append(Spacer(1, 0.8 * cm))

    # ── Customer: Name / Address box ──
    customer_lines = []
    if customer:
        customer_lines = [customer.name, customer.contact_person, customer.address, customer.phone, customer.email]
    customer_text = "<br/>".join(_text(v) for v in customer_lines if v) or "—"
    customer_box = Table(
        [[Paragraph("Name / Address", label_left)], [Paragraph(customer_text, body)]],
        colWidths=[8.5 * cm], rowHeights=[None, None], hAlign="LEFT",
    )
    customer_box.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.75, BORDER),
        ("LINEBELOW", (0, 0), (-1, 0), 0.75, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("LEFTPADDING", (0, 0), (-1, 0), 10),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 30),
    ]))
    story.append(customer_box)
    story.append(Spacer(1, 0.8 * cm))

    # ── Items: Description | Qty | Rate | Total ──
    rows = [[Paragraph("Description", label), Paragraph("Qty", label), Paragraph("Rate", label), Paragraph("Total", label)]]
    for item in quotation.items or []:
        description = [_text(item.get("name") or "—")]
        included = item.get("included_tests") or []
        if item.get("package_id") and included:
            groups = [
                ("PHYSIOCHEMICAL TEST", [t for t in included if t.get("category") == "physicochemical"]),
                ("MICROBIOLOGICAL TEST", [t for t in included if t.get("category") == "microbiological"]),
                ("OTHER TESTS", [t for t in included if t.get("category") not in ("physicochemical", "microbiological")]),
            ]
            for heading, tests in groups:
                if tests:
                    names = ", ".join(_text(t.get("name") or "—") for t in tests)
                    description.append(f"<br/>{heading}<br/>{names}")
        rows.append([
            Paragraph("<br/>".join(description), body),
            Paragraph(f"{float(item.get('quantity', 0)):g}", body_right),
            Paragraph(_fmt_amount(item.get("unit_price", 0)), body_right),
            Paragraph(_fmt_amount(item.get("total", 0)), body_right),
        ])
    # Blank row so the column rules run on below the last item, as on the template.
    rows.append(["", "", "", ""])
    row_heights = [None] * (len(rows) - 1) + [3 * cm]

    items_table = Table(rows, colWidths=ITEM_COLS, rowHeights=row_heights, repeatRows=1)
    items_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.75, BORDER),
        ("LINEAFTER", (0, 0), (-2, -1), 0.75, BORDER),
        ("LINEBELOW", (0, 0), (-1, 0), 0.75, BORDER),
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("TOPPADDING", (0, 1), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
    ]))
    story.append(items_table)

    # ── Notes / Terms on the left, totals on the right ──
    notes_cell = [Paragraph(ORDER_MESSAGE, body), Spacer(1, 0.25 * cm), Paragraph("<b>NOTES</b>", body)]
    if quotation.notes:
        notes_cell.append(Paragraph(_text(quotation.notes), body))
    terms_cell = [Paragraph("<b>TERMS &amp; CONDITIONS</b>", body)]
    if quotation.terms:
        terms_cell.append(Paragraph(_text(quotation.terms), body))

    totals = Table(
        [
            [Paragraph("Subtotal", totals_label), Paragraph(_fmt_money(quotation.subtotal, currency), body)],
            [Paragraph(f"Sales Tax ({float(quotation.vat_rate or 0):g}%)", totals_label), Paragraph(_fmt_money(quotation.vat_amount, currency), body)],
            [Paragraph("Total", total_label), Paragraph(_fmt_money(quotation.total, currency), body)],
        ],
        colWidths=[ITEM_COLS[2] + 0.3 * cm, ITEM_COLS[3] - 0.3 * cm],
    )
    totals.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -2), 0.75, BORDER),
        ("LINEAFTER", (0, 0), (0, -1), 0.75, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))

    left_width = ITEM_COLS[0] + ITEM_COLS[1]
    footer_block = Table(
        [[notes_cell, ""], [terms_cell, totals]],
        colWidths=[left_width, PAGE_WIDTH - left_width],
        rowHeights=[None, None],
    )
    footer_block.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.75, BORDER),
        ("LINEAFTER", (0, 0), (0, -1), 0.75, BORDER),
        # Full width so the rule also runs above Subtotal on the right.
        ("LINEBELOW", (0, 0), (-1, 0), 0.75, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (0, -1), 4),
        ("BOTTOMPADDING", (0, 0), (0, -1), 40),
        ("TOPPADDING", (1, 1), (1, 1), 0),
        ("BOTTOMPADDING", (1, 1), (1, 1), 0),
        ("LEFTPADDING", (1, 1), (1, 1), 0),
        ("RIGHTPADDING", (1, 1), (1, 1), 0),
    ]))
    story.append(footer_block)
    story.append(Spacer(1, 0.3 * cm))

    # ── Contact row ──
    contact = Table(
        [
            [Paragraph("Phone #", label), "", Paragraph("E-mail", label), "", Paragraph("Web Site", label)],
            [Paragraph(COMPANY_PHONE, body_center), "", Paragraph(COMPANY_EMAIL, body_center), "", Paragraph(COMPANY_WEBSITE, body_center)],
        ],
        colWidths=[3.6 * cm, 2.6 * cm, 6.2 * cm, 0.4 * cm, 5.2 * cm],
    )
    contact.setStyle(TableStyle([
        ("BOX", (0, 0), (0, -1), 0.75, BORDER),
        ("BOX", (2, 0), (2, -1), 0.75, BORDER),
        ("BOX", (4, 0), (4, -1), 0.75, BORDER),
        ("LINEBELOW", (0, 0), (0, 0), 0.75, BORDER),
        ("LINEBELOW", (2, 0), (2, 0), 0.75, BORDER),
        ("LINEBELOW", (4, 0), (4, 0), 0.75, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(contact)

    doc.build(story)
    return buffer.getvalue()
