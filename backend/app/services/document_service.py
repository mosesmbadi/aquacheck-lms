"""
DOCX content extraction and PDF generation for controlled documents.
"""
import io
import re
from typing import List, Dict

# ─── DOCX extraction ─────────────────────────────────────────────────────────

_HEADING_RE = re.compile(r"^\s*\d+[\.\d]*\s*([\u2013\-]|\d)*")


def _is_heading(text: str, style: str) -> bool:
    """Heuristic: paragraph is a section heading."""
    clean = text.strip()
    if not clean:
        return False
    # Numbered section (1.0, 2.0, 9.1, …)
    if re.match(r"^\d+[\.\d]*\s+\S", clean):
        return True
    # Styles used for headings in these DOCX templates
    if style in ("BodyText", "Footer") and re.match(r"^\d+", clean):
        return True
    return False


def extract_sections(docx_path: str) -> List[Dict[str, str]]:
    """
    Parse a DOCX file and return a list of
    {"heading": str, "body": str} sections.
    """
    from docx import Document as DocxDoc  # python-docx

    doc = DocxDoc(docx_path)
    sections: List[Dict[str, str]] = []
    current_heading = ""
    current_body_lines: List[str] = []

    def flush():
        if current_heading or current_body_lines:
            sections.append({
                "heading": current_heading,
                "body": "\n".join(current_body_lines).strip(),
            })

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue

        style_name = para.style.name if para.style else "Normal"

        if _is_heading(text, style_name):
            flush()
            current_heading = text
            current_body_lines = []
        else:
            prefix = "• " if style_name == "List Paragraph" else ""
            current_body_lines.append(prefix + text)

    flush()
    return sections


# ─── PDF generation ───────────────────────────────────────────────────────────

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable, KeepTogether
)
from reportlab.platypus import PageTemplate, Frame
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

from app.services.pdf_fonts import FONT, FONT_BOLD

_PRIMARY = colors.HexColor("#0369a1")   # primary-700 blue
_LIGHT    = colors.HexColor("#e0f2fe")  # primary-50


def _header_footer(canvas, doc, code: str, version: str):
    canvas.saveState()
    w, h = A4

    # ── Top bar ────────────────────────────────────────────────────────────
    canvas.setFillColor(_PRIMARY)
    canvas.rect(0, h - 1.8 * cm, w, 1.8 * cm, fill=True, stroke=False)

    canvas.setFillColor(colors.white)
    canvas.setFont(FONT_BOLD, 10)
    canvas.drawString(1.5 * cm, h - 1.1 * cm, "AQUACHECK LABORATORIES LTD")

    canvas.setFont(FONT, 9)
    canvas.drawRightString(w - 1.5 * cm, h - 1.1 * cm, f"{code}  |  Rev {version}")

    # ── Bottom bar ─────────────────────────────────────────────────────────
    canvas.setFillColor(_LIGHT)
    canvas.rect(0, 0, w, 0.8 * cm, fill=True, stroke=False)
    canvas.setFillColor(_PRIMARY)
    canvas.setFont(FONT, 8)
    canvas.drawString(1.5 * cm, 0.3 * cm, "Controlled Document — AquaCheck LIMS")
    canvas.drawRightString(w - 1.5 * cm, 0.3 * cm, f"Page {doc.page}")

    canvas.restoreState()


def generate_pdf(
    code: str,
    title: str,
    version: str,
    status: str,
    effective_date,
    sections: List[Dict[str, str]],
) -> bytes:
    """Render a professional A4 PDF from stored document content."""
    buf = io.BytesIO()

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.8 * cm,
        rightMargin=1.8 * cm,
        topMargin=2.8 * cm,
        bottomMargin=1.8 * cm,
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Normal"],
        fontSize=14,
        fontName=FONT_BOLD,
        textColor=_PRIMARY,
        spaceAfter=4,
        alignment=TA_CENTER,
    )
    meta_style = ParagraphStyle(
        "Meta",
        parent=styles["Normal"],
        fontSize=9,
        fontName=FONT,
        textColor=colors.HexColor("#6b7280"),
        alignment=TA_CENTER,
        spaceAfter=2,
    )
    heading_style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Normal"],
        fontSize=10,
        fontName=FONT_BOLD,
        textColor=_PRIMARY,
        spaceBefore=14,
        spaceAfter=4,
        borderPad=4,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontSize=9,
        fontName=FONT,
        leading=14,
        textColor=colors.HexColor("#374151"),
        spaceAfter=4,
    )

    story = []

    # ── Title block ────────────────────────────────────────────────────────
    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph(title, title_style))

    meta_parts = [f"Version {version}", status.replace("_", " ").title()]
    if effective_date:
        meta_parts.append(f"Effective: {effective_date}")
    story.append(Paragraph("  ·  ".join(meta_parts), meta_style))
    story.append(Spacer(1, 0.2 * cm))
    story.append(HRFlowable(width="100%", thickness=1, color=_PRIMARY, spaceAfter=10))

    # ── Sections ───────────────────────────────────────────────────────────
    for sec in sections:
        block = []
        if sec.get("heading"):
            block.append(Paragraph(sec["heading"], heading_style))
        if sec.get("body"):
            for line in sec["body"].split("\n"):
                line = line.strip()
                if line:
                    # Escape XML special chars
                    line = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                    block.append(Paragraph(line, body_style))
        if block:
            story.append(KeepTogether(block))

    doc.build(
        story,
        onFirstPage=lambda c, d: _header_footer(c, d, code, version),
        onLaterPages=lambda c, d: _header_footer(c, d, code, version),
    )

    return buf.getvalue()
