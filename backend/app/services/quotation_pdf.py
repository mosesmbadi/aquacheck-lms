import io
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle


def _fmt_money(value, currency: str) -> str:
    try:
        return f"{currency} {float(value):,.2f}"
    except (TypeError, ValueError):
        return f"{currency} 0.00"


def build_quotation_pdf(quotation, customer) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=2 * cm, bottomMargin=2 * cm)
    styles = getSampleStyleSheet()
    story = []

    title_style = ParagraphStyle("title", parent=styles["Heading1"], textColor=colors.HexColor("#1A1A2E"), fontSize=16, alignment=1, spaceAfter=6)
    company_style = ParagraphStyle("company", parent=styles["Normal"], fontSize=8, leading=10, alignment=2)
    small_style = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, leading=10)

    header_table = Table(
        [[
            Paragraph("<b>AQUACHECK</b><br/>Trusted Quality Check Partner", styles["Title"]),
            Paragraph(
                "AQUACHECK LABORATORIES LIMITED<br/>P.O. Box 216 - 00300, NAIROBI<br/>Westlands Commercial Centre<br/>Off Ring Road, Parklands Rd<br/>Email: aquachecklab@gmail.com<br/>Website: www.aquachecklab.com<br/>Tel: 0755596064/0734933819",
                company_style,
            ),
        ]],
        colWidths=[8.2 * cm, 8.8 * cm],
    )
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, 0), 1, colors.HexColor("#60a5fa")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 0.15 * cm))
    story.append(Paragraph("QUOTATION", title_style))
    story.append(Spacer(1, 0.15 * cm))

    currency = quotation.currency or "KES"
    valid_until = quotation.valid_until.strftime("%d/%m/%Y") if quotation.valid_until else "—"
    issued_on = quotation.created_at.strftime("%d/%m/%Y") if quotation.created_at else "—"

    info_data = [
        ["QUOTE #:", quotation.quote_number, "DATE:", issued_on],
        ["CLIENT:", customer.name if customer else "N/A", "VALID UNTIL:", valid_until],
        ["CONTACT:", (customer.contact_person if customer else "") or "—", "EMAIL:", (customer.email if customer else "") or "—"],
        ["ADDRESS:", (customer.address if customer else "") or "—", "PHONE:", (customer.phone if customer else "") or "—"],
    ]
    info_table = Table(info_data, colWidths=[3.2 * cm, 5.3 * cm, 3.2 * cm, 5.3 * cm])
    info_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 0.3 * cm))

    # Items table
    rows = [["#", "TEST / SERVICE", "UNIT", "QTY", "UNIT PRICE", "TOTAL"]]
    items = quotation.items or []
    for idx, item in enumerate(items, start=1):
        rows.append([
            str(idx),
            item.get("name", "—"),
            item.get("unit") or "—",
            f"{float(item.get('quantity', 0)):g}",
            _fmt_money(item.get("unit_price", 0), currency),
            _fmt_money(item.get("total", 0), currency),
        ])

    items_table = Table(rows, colWidths=[1 * cm, 7.5 * cm, 2 * cm, 1.5 * cm, 2.5 * cm, 2.5 * cm])
    items_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e5e7eb")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#9ca3af")),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
        ("PADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 0.2 * cm))

    # Totals
    totals = [
        ["Subtotal", _fmt_money(quotation.subtotal, currency)],
        [f"VAT ({float(quotation.vat_rate):g}%)", _fmt_money(quotation.vat_amount, currency)],
        ["TOTAL", _fmt_money(quotation.total, currency)],
    ]
    totals_table = Table(totals, colWidths=[13 * cm, 4 * cm])
    totals_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LINEABOVE", (0, -1), (-1, -1), 1, colors.black),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(totals_table)
    story.append(Spacer(1, 0.4 * cm))

    if quotation.notes:
        story.append(Paragraph("<b>NOTES</b>", small_style))
        story.append(Paragraph(quotation.notes.replace("\n", "<br/>"), small_style))
        story.append(Spacer(1, 0.2 * cm))

    if quotation.terms:
        story.append(Paragraph("<b>TERMS &amp; CONDITIONS</b>", small_style))
        story.append(Paragraph(quotation.terms.replace("\n", "<br/>"), small_style))
        story.append(Spacer(1, 0.2 * cm))

    story.append(Spacer(1, 0.8 * cm))
    signatory_table = Table([
        [Paragraph("<b>Authorized by</b><br/>AquaCheck Laboratories Ltd", styles["Normal"])]
    ], colWidths=[8.5 * cm])
    signatory_table.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (0, 0), 1, colors.black),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(signatory_table)

    doc.build(story)
    return buffer.getvalue()
