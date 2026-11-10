from collections import OrderedDict
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional
import io
import re
import base64
import os
from pathlib import Path
from urllib.parse import quote
from xml.sax.saxutils import escape
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm.attributes import flag_modified

_LOGO_PATH = Path(__file__).parent.parent / "images" / "aquacheck logo.png"
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm, mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, PageBreak, Image as RLImage
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas
from app.services.pdf_fonts import FONT, FONT_BOLD, FONT_ITALIC
from app.deps import get_db, get_current_user
from app.models.user import User, UserRole
from app.models.report import Report, ReportStatus
from app.models.contract import Contract
from app.models.customer import Customer
from app.models.sample import Sample, SampleStatus
from app.models.test_result import TestResult
from app.models.test_catalog import TestCatalogItem, TestCategory
from app.models.result_qualifier import ResultQualifier
from app.schemas.report import ReportCreate, ReportUpdate, ReportOut
from app.services.audit import log_action
from app.services.auth import create_access_token, decode_access_token
from app.services.barcode import generate_barcode
from app.services.compliance import evaluate_item_remark, legend_entries
from app.services.signatories import frozen_signatories, resolve_signatories

router = APIRouter(prefix="/reports", tags=["Reports"])


def _next_report_number(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    count = db.query(Report).filter(Report.report_number.like(f"RPT-{year}-%")).count()
    return f"RPT-{year}-{str(count + 1).zfill(5)}"


def _content_value(content: dict, key: str, default=None):
    value = (content or {}).get(key, default)
    return default if value in (None, "") else value


# Kenya keeps EAT (UTC+3) all year; report dates are the lab's calendar dates.
_LAB_TZ = timezone(timedelta(hours=3), "EAT")


def _format_date(value):
    """dd/mm/yyyy for a date, a datetime or an ISO date string typed onto the report."""
    if not value:
        return "—"
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return value
    if isinstance(value, datetime) and value.tzinfo is not None:
        value = value.astimezone(_LAB_TZ)
    if isinstance(value, (date, datetime)):
        return value.strftime("%d/%m/%Y")
    return str(value)


PHYSIO_SECTION = "Physio-Chemical Test"
MICRO_SECTION = "Microbiological Test"
# Paint reports head the microbiology section this way, as on the lab's paint report.
PAINT_MICRO_SECTION = "Microbiology Test"
# Sections that start the report's microbiology page (matched case-insensitively, so
# manually entered section titles count too).
_MICRO_SECTION_TITLES = {MICRO_SECTION.lower(), PAINT_MICRO_SECTION.lower()}

_SCHEDULE_SPEC_HEADERS = {
    3: "NEMA STANDARD FOR EFFLUENT WATER;\nTHIRD SCHEDULE.\nMaximum levels Permissible.",
    4: "NEMA MONITORING GUIDE;\nFOURTH SCHEDULE.",
    5: "NEMA STANDARD FOR EFFLUENT WATER;\nFIFTH SCHEDULE.\nMaximum levels Permissible.",
    6: "NEMA MONITORING STANDARD;\nSIXTH SCHEDULE.",
}

_SCHEDULE_CONTEXT = {
    3: "NEMA specifications for discharge into the environment based on the legal notice No. 120 of EMCA, 2006",
    5: "NEMA specifications for discharge into public sewers based on the legal notice No. 120 of EMCA, 2006",
    6: "NEMA specifications for discharge of treated effluent into the environment based on the legal notice No. 120 of EMCA, 2006",
}

WHO_CONTEXT = "the World Health Organization (WHO) Guidelines for Drinking-water Quality"


def _legend_entries(qualifiers, is_waste, show_who=False):
    """(code, label) rows of the KEY under the results table, from the editable qualifier table."""
    entries = [(q.code, q.label) for q in legend_entries(qualifiers, is_waste=is_waste)]
    if show_who and not any(code.upper() == "WHO" for code, _ in entries):
        entries.append(WHO_LEGEND)
    return entries


PAINT_REMARKS_HEADER = "REMARKS/RATING SYSTEM"
PAINT_COMMENT = "Each parameter's level is shown in the RESULTS table above for the sample submitted to the lab."
_ASTM_LEGEND = ("ASTM", "American Society for Testing and Materials")


ACCREDITED_MARK = "*"
SUBCONTRACTED_MARK = "✓"
MARK_LEGEND = (
    (ACCREDITED_MARK, "Accredited parameter"),
    (SUBCONTRACTED_MARK, "Subcontracted parameter"),
)
SYSTEM_GENERATED_NOTE = "This is a system generated document"


def parameter_mark(catalog_item, sample, content: dict) -> str:
    """The mark printed after a parameter's name: "✓" subcontracted, "*" accredited.

    Accreditation is chosen per sample (sample.accredited_test_ids). Older samples without
    that list fall back to the catalog (the lab's scope), frozen onto the report when it
    is issued so a later scope change can't alter it. A subcontracted result never
    carries the lab's accreditation mark — that covers only work the lab does itself."""
    if catalog_item is None:
        return ""
    if catalog_item.id in ((getattr(sample, "subcontracted_test_ids", None) if sample else None) or []):
        return SUBCONTRACTED_MARK
    per_sample = getattr(sample, "accredited_test_ids", None) if sample else None
    frozen = (content or {}).get("accredited_test_ids")
    if isinstance(per_sample, list):
        accredited = catalog_item.id in per_sample
    elif isinstance(frozen, list):
        accredited = catalog_item.id in frozen
    else:
        accredited = bool(catalog_item.is_accredited)
    return ACCREDITED_MARK if accredited else ""


def mark_legend(result_sections):
    """(mark, label) for each mark that actually appears on the report."""
    used = {row.get("mark") for section in result_sections for row in section.get("rows", [])}
    return [(mark, label) for mark, label in MARK_LEGEND if mark in used]


def _mark_markup(mark: str) -> str:
    # The standard PDF fonts have no "✓"; ZapfDingbats draws it as character "3".
    return '<font name="ZapfDingbats">3</font>' if mark == SUBCONTRACTED_MARK else escape(mark)


def _is_paint(sample) -> bool:
    category = getattr(sample, "sample_category", None) if sample else None
    return getattr(category, "value", category) == "paint"


def _is_swimming_pool(sample) -> bool:
    category = getattr(sample, "sample_category", None) if sample else None
    return getattr(category, "value", category) == "swimming_pool"


SWIMMING_POOL_SPEC_HEADER = (
    "W.H.O Guidelines for Safe Recreational Water Environments;\n"
    "Volume 2 Swimming Pools & Similar Environments."
)
SWIMMING_POOL_CONTEXT = "W.H.O. guidelines for safe recreational water, swimming pools, and similar environments"


WHO_SPEC_HEADER = "W.H.O\nStandard\nLimit"
WHO_LEGEND = ("WHO", "World Health Organization")
NO_REMARKS_COMMENT = "The level of each parameter is shown in the RESULTS table above for the water submitted to the lab."


def report_options(content: dict, customer, sample):
    """(show_who, show_remarks) for a report.

    A value stored on the report wins; otherwise the client's default applies. Issuing
    a report writes the resolved values onto it, so changing a client's defaults later
    never alters a report already issued. WHO drinking-water guidelines mean nothing for
    effluent or paint, and a paint report's remarks are its ratings, so neither option
    applies to those. A swimming-pool report's specification already is the WHO
    (recreational water) guideline, so it gets no second WHO column."""
    content = content or {}
    category = getattr(sample, "sample_category", None) if sample else None
    category = getattr(category, "value", category)

    def _option(key, customer_attr):
        value = content.get(key)
        if isinstance(value, bool):
            return value
        return bool(getattr(customer, customer_attr, False)) if customer else False

    show_who = category not in ("waste", "paint", "swimming_pool") and _option("show_who_limits", "report_show_who")
    hide_remarks = category != "paint" and _option("hide_remarks", "report_hide_remarks")
    return show_who, not hide_remarks


def _paint_legend_entries(qualifiers, result_sections):
    """Paint reports list only the abbreviations that actually appear on them — the
    water legend (KS, EAS, APHA…) means nothing here."""
    text = " ".join(
        f"{row.get('method', '')} {row.get('result', '')} {row.get('remarks', '')}"
        for section in result_sections
        for row in section.get("rows", [])
    )
    entries = []
    if re.search(r"\bASTM\b", text) and not any(q.code.upper() == "ASTM" for q in qualifiers):
        entries.append(_ASTM_LEGEND)
    for q in qualifiers:
        if q.is_active and q.show_in_legend and re.search(rf"\b{re.escape(q.code)}\b", text, re.IGNORECASE):
            entries.append((q.code, q.label))
    return entries


def _remark_kind(row) -> str:
    """The remark kind of a row; inferred from its text for hand-written result_sections."""
    if row.get("remark_kind"):
        return row["remark_kind"]
    text = str(row.get("remarks") or "").strip().upper()
    if "NON-COMPLIANT" in text:
        return "non_compliant"
    if "COMPLIANT" in text:
        return "compliant"
    return "not_tested" if text == "NOT TESTED" else ""


def _section_title(item, is_paint: bool) -> str:
    custom = (item.section or "").strip()
    if custom:
        return custom
    if item.category == TestCategory.physicochemical:
        return PHYSIO_SECTION
    return PAINT_MICRO_SECTION if is_paint else MICRO_SECTION


def load_report_results(db: Session, sample):
    """The tests a sample's report lists, in report order (the catalog's Sort Order),
    with their results and the qualifier vocabulary needed to judge them.
    Returns (items, result_by_item_id, qualifiers).

    Every requested test is listed, measured or not: a missing result prints as
    "Not tested" and never counts as a pass (ISO/IEC 17025 §7.8.2). Samples registered
    without a request list fall back to the tests that have results."""
    results = []
    if sample:
        results = (
            db.query(TestResult)
            .filter(TestResult.sample_id == sample.id, TestResult.catalog_item_id.isnot(None))
            .order_by(TestResult.created_at.asc())
            .all()
        )
    # The latest entry for a test wins.
    result_by_item = {r.catalog_item_id: r for r in results}

    item_ids = list((sample.requested_test_ids or []) if sample else []) or list(result_by_item)
    items = (
        db.query(TestCatalogItem)
        .filter(TestCatalogItem.id.in_(item_ids))
        .order_by(TestCatalogItem.sort_order, TestCatalogItem.name)
        .all()
        if item_ids else []
    )
    qualifiers = (
        db.query(ResultQualifier)
        .filter(ResultQualifier.is_active == True)  # noqa: E712
        .order_by(ResultQualifier.sort_order, ResultQualifier.code)
        .all()
    )
    return items, result_by_item, qualifiers


def _result_sections(items, result_by_item, content: dict, sample=None, qualifiers=(), show_who=False):
    """Report rows grouped into the sections the report prints. Category sections come
    first (physio-chemical, then microbiological); a test's own section (e.g.
    "Susceptibility Test") follows in the order its first test appears."""
    manual_sections = content.get("result_sections")
    if isinstance(manual_sections, list) and manual_sections:
        return manual_sections

    is_paint = _is_paint(sample)
    sections = OrderedDict((title, []) for title in (PHYSIO_SECTION, MICRO_SECTION, PAINT_MICRO_SECTION))
    for item in items:
        result = result_by_item.get(item.id)
        value = ((result.result_value if result else None) or "").strip()
        raw = (result.raw_observations if result else None) or {}
        stored_remark = raw.get("remarks") if isinstance(raw.get("remarks"), str) else ""
        who_specification = (item.who_limit or "NS") if show_who else None
        # The same rules as the result entry screen; a stored remark only counts for
        # tests whose remark is written by the analyst.
        remark = evaluate_item_remark(
            item.remark_rule, item.standard_limit, value, qualifiers, stored_remark, who_specification
        )
        sections.setdefault(_section_title(item, is_paint), []).append({
            "parameter": item.name or "—",
            "mark": parameter_mark(item, sample, content),
            "method": item.method_name or "—",
            "result": value or "—",
            "specification": item.standard_limit or "NS",
            "who_specification": who_specification,
            "remarks": remark.label,
            "remark_kind": remark.kind.value,
        })
    return [{"title": title, "rows": rows} for title, rows in sections.items() if rows]


def _specification_context(sample, items, content: dict, show_who: bool):
    """(column header, conformity context, natural potable?) for the specification the
    report judges results against. The context completes "The sample does not comply with …"."""
    category = getattr(getattr(sample, "sample_category", None), "value", None) if sample else None
    waste_schedule = getattr(sample, "waste_schedule", None) if sample else None
    override = _content_value(content, "specification_title", None)
    natural = False
    if category == "waste":
        header = _SCHEDULE_SPEC_HEADERS.get(waste_schedule, "NEMA STANDARD")
        context = _SCHEDULE_CONTEXT.get(waste_schedule, "the applicable NEMA standard")
    elif category == "packaged_drinking_water":
        header = "KS EAS 12:2018\nPackaged Drinking Water Limit"
        context = "KS EAS 12:2018 specifications for packaged drinking water"
    elif category == "swimming_pool":
        header = SWIMMING_POOL_SPEC_HEADER
        context = SWIMMING_POOL_CONTEXT
    else:
        # Natural vs treated isn't stored on the sample; the requested tests come from
        # that sub-type's catalog set, so they tell us which one was picked.
        natural = category == "potable" and (
            any(item.water_type == "potable_natural" for item in items)
            or bool(re.search("natural", getattr(sample, "sample_type", None) or "", re.IGNORECASE))
        )
        label = "Natural Potable Water" if natural else "Treated Potable Water"
        header = f"KS EAS 12:2018\n{label} Limit"
        context = f"KS EAS 12:2018 specifications for {label.lower()}"
    if show_who:
        context = f"{context} and {WHO_CONTEXT}"
    return override or header, context, natural


def _comment_paragraphs(content, sample, result_sections, context, natural, show_remarks):
    """The COMMENTS block, or None when the report has nothing to say."""
    rows = [row for section in result_sections for row in section.get("rows", [])]
    non_compliant = [row["parameter"] for row in rows if _remark_kind(row) == "non_compliant"]
    untested = [row["parameter"] for row in rows if _remark_kind(row) == "not_tested"]
    evaluated = sum(1 for row in rows if _remark_kind(row) in ("compliant", "non_compliant"))
    is_paint = _is_paint(sample)
    final_comment = _content_value(content, "final_comment", "")
    if not (is_paint or not show_remarks or non_compliant or evaluated or untested or final_comment):
        return None

    category = getattr(getattr(sample, "sample_category", None), "value", None) if sample else None
    paragraphs = []
    if final_comment:
        paragraphs.append(final_comment)
    elif is_paint:
        paragraphs.append(PAINT_COMMENT)
    elif not show_remarks:
        # Without remarks the report makes no conformity statement, so neither may the comment.
        paragraphs.append(NO_REMARKS_COMMENT)
    elif non_compliant:
        names = ", ".join(non_compliant)
        if category == "swimming_pool":
            # Pool limits include minimums (free chlorine, ORP), so "exceeded" would
            # misstate a too-low result.
            paragraphs.append(
                f"The sample does not comply with {context}. The parameters; {names} do not meet "
                "the set limits. Corrective treatment of the pool water is therefore recommended."
            )
        elif category == "waste":
            paragraphs.append(
                f"The parameters; {names} do not meet {context}. "
                "Treatment is therefore recommended."
            )
        else:
            paragraphs.append(
                f"The sample does not comply with {context}. The {names} exceeded the set limit. "
                f"{'Treatment' if natural else 'Further treatment'} is therefore recommended."
            )
    elif evaluated:
        paragraphs.append(f"All tested parameters comply with {context}.")

    # The conformity statement covers only parameters actually measured, so any gap is
    # stated rather than left to inference.
    if untested:
        one = len(untested) == 1
        names = ", ".join(untested)
        if is_paint or not show_remarks:
            paragraphs.append(f"The following requested {'parameter was' if one else 'parameters were'} not tested: {names}.")
        else:
            paragraphs.append(
                f"The following requested {'parameter was' if one else 'parameters were'} not tested and "
                f"{'is' if one else 'are'} excluded from the statement above: {names}."
            )
    return paragraphs


# A sample's results are final once every test is validated (sample → completed);
# archiving and disposal only happen after that.
_RESULTS_FINAL_STATUSES = (SampleStatus.completed, SampleStatus.archived, SampleStatus.disposed)
_ISSUED_STATUSES = (ReportStatus.issued, ReportStatus.amended)


def _results_final(sample) -> bool:
    return sample is not None and sample.status in _RESULTS_FINAL_STATUSES


def _ensure_customer_can_view(report: Report, current_user: User, db: Session) -> None:
    """Customers see only issued reports addressed to their own account."""
    if current_user.role != UserRole.customer:
        return
    contract = db.query(Contract).filter(Contract.id == report.contract_id).first() if report.contract_id else None
    contract_customer_id = contract.customer_id if contract else None
    owns = current_user.customer_id and current_user.customer_id in (report.customer_id, contract_customer_id)
    if not owns or report.status not in _ISSUED_STATUSES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")


def _list_row(report: Report) -> ReportOut:
    """A report as listed: without the signature images frozen onto issued reports or the
    content snapshot each amendment keeps. Those made the list megabytes long; the
    single-report endpoints and the PDF still have them."""
    out = ReportOut.model_validate(report)
    content = dict(out.content or {})
    if isinstance(content.get("signatories"), dict):
        content["signatories"] = {
            slot: {k: v for k, v in entry.items() if k != "signature_b64"} if isinstance(entry, dict) else entry
            for slot, entry in content["signatories"].items()
        }
    history = [
        {k: v for k, v in entry.items() if k != "previous_content"} if isinstance(entry, dict) else entry
        for entry in (out.revision_history or [])
    ]
    return out.model_copy(update={"content": content, "revision_history": history})


@router.get("", response_model=List[ReportOut])
def list_reports(
    include_pending: bool = False,
    sample_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """include_pending (staff only) also returns drafts whose results aren't final yet —
    the sample-page preview needs the sample's draft report whatever its state.
    sample_id narrows the list to that sample's report."""
    return [_list_row(r) for r in _listed_reports(include_pending, sample_id, db, current_user)]


def _listed_reports(include_pending, sample_id, db: Session, current_user: User):
    q = db.query(Report)
    if sample_id is not None:
        q = q.filter(Report.content["sample_id"].as_integer() == sample_id)
    if current_user.role == UserRole.customer:
        # Customers only ever see issued reports for their own account.
        if not current_user.customer_id:
            return []
        q = (
            q.outerjoin(Contract, Report.contract_id == Contract.id)
             .filter(or_(
                 Report.customer_id == current_user.customer_id,
                 Contract.customer_id == current_user.customer_id,
             ))
             .filter(Report.status.in_(_ISSUED_STATUSES))
        )
        return q.order_by(Report.created_at.desc()).all()

    # Staff: a sample's report is listed for issuance only once all its results are
    # validated (sample completed). Issued reports and contract-level reports (no
    # sample) are always listed.
    reports = q.order_by(Report.created_at.desc()).all()
    if include_pending:
        return reports
    sample_ids ={r.content.get("sample_id") for r in reports if r.content and r.content.get("sample_id")}
    final_ids = {
        sid for (sid,) in db.query(Sample.id).filter(
            Sample.id.in_(sample_ids), Sample.status.in_(_RESULTS_FINAL_STATUSES)
        )
    } if sample_ids else set()
    return [
        r for r in reports
        if r.status in _ISSUED_STATUSES
        or not (r.content or {}).get("sample_id")
        or r.content["sample_id"] in final_ids
    ]


@router.post("", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def create_report(
    payload: ReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.customer:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Customers are not permitted to create reports.",
        )
    contract = None
    if payload.contract_id:
        contract = db.query(Contract).filter(Contract.id == payload.contract_id).first()
        if not contract:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")

    content = payload.content or {}
    sample_id = content.get("sample_id")
    sample = None
    if sample_id:
        sample = db.query(Sample).filter(Sample.id == sample_id).first()
        if not sample:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
        # One report per sample — corrections are made by amending it, not by issuing another.
        existing = db.query(Report).filter(Report.content["sample_id"].as_integer() == sample.id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Sample already has report {existing.report_number} — edit or amend that one instead.",
            )

    contract_id = payload.contract_id
    if not contract_id and sample and sample.contract_id:
        contract_id = sample.contract_id
        contract = db.query(Contract).filter(Contract.id == contract_id).first()

    if contract_id and sample and sample.contract_id and sample.contract_id != contract_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected sample does not belong to this contract")

    resolved_customer_id = payload.customer_id or (contract.customer_id if contract else None) or (sample.customer_id if sample else None)

    report_data = payload.model_dump()
    report_data["contract_id"] = contract_id
    report_data["customer_id"] = resolved_customer_id
    report = Report(**report_data, report_number=_next_report_number(db))
    db.add(report)
    db.commit()
    db.refresh(report)
    log_action(db, current_user.id, "CREATE_REPORT", "report", str(report.id))
    return report


@router.get("/{report_id}", response_model=ReportOut)
def get_report(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    _ensure_customer_can_view(report, current_user, db)
    return report


@router.put("/{report_id}", response_model=ReportOut)
def update_report(
    report_id: int,
    payload: ReportUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.customer:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Customers cannot edit reports.")
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    update_data = payload.model_dump(exclude_unset=True, exclude={"amendment_reason"})
    revision = list(report.revision_history or [])

    if report.status in (ReportStatus.issued, ReportStatus.amended):
        if not payload.amendment_reason:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="amendment_reason is required when editing an issued or amended report.",
            )
        revision.append({
            "action": "amended",
            "user_id": current_user.id,
            "reason": payload.amendment_reason,
            "previous_content": report.content,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        update_data["status"] = ReportStatus.amended
    else:
        revision.append({
            "action": "edited",
            "user_id": current_user.id,
            "reason": payload.amendment_reason or "Draft edit",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    update_data["revision_history"] = revision
    # Signatories are frozen at issue and never edited here. Listed reports omit their
    # signature images, so content saved from a list row must not overwrite them.
    frozen_signers = (report.content or {}).get("signatories")
    if update_data.get("content") is not None and isinstance(frozen_signers, dict):
        update_data["content"] = {**update_data["content"], "signatories": frozen_signers}
    for k, v in update_data.items():
        setattr(report, k, v)
    flag_modified(report, "content")
    flag_modified(report, "revision_history")

    db.commit()
    db.refresh(report)
    log_action(db, current_user.id, "UPDATE_REPORT", "report", str(report_id))
    return report


@router.post("/{report_id}/issue", response_model=ReportOut)
def issue_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.customer:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Customers are not permitted to issue reports.",
        )
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    # Freeze the layout options onto the report, so a later change to the client's
    # defaults can't alter what was issued.
    content = dict(report.content or {})
    sample = db.query(Sample).filter(Sample.id == content.get("sample_id")).first() if content.get("sample_id") else None
    if content.get("sample_id") and not _results_final(sample):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This report can't be issued yet — all of the sample's test results must be validated first.",
        )
    contract = db.query(Contract).filter(Contract.id == report.contract_id).first() if report.contract_id else None
    customer_id = (
        report.customer_id
        or (contract.customer_id if contract else None)
        or (sample.customer_id if sample else None)
    )
    customer = db.query(Customer).filter(Customer.id == customer_id).first() if customer_id else None
    show_who, show_remarks = report_options(content, customer, sample)
    content["show_who_limits"] = show_who
    content["hide_remarks"] = not show_remarks
    # Freeze the accreditation marks too (first issue only — an amendment keeps the
    # scope the report was originally issued under).
    if not isinstance(content.get("accredited_test_ids"), list):
        content["accredited_test_ids"] = [
            item_id
            for (item_id,) in db.query(TestCatalogItem.id).filter(TestCatalogItem.is_accredited == True)  # noqa: E712
        ]
    # And the signatories (first issue only), so reassigning them in Admin doesn't
    # change who signed an already-issued report.
    if not isinstance(content.get("signatories"), dict):
        content["signatories"] = frozen_signatories(db)
    report.content = content
    flag_modified(report, "content")

    report.status = ReportStatus.issued
    report.issued_by = current_user.id
    report.issued_at = datetime.now(timezone.utc)
    revision = list(report.revision_history or [])
    revision.append({"action": "issued", "user_id": current_user.id, "timestamp": datetime.now(timezone.utc).isoformat()})
    report.revision_history = revision
    db.commit()
    db.refresh(report)
    log_action(db, current_user.id, "ISSUE_REPORT", "report", str(report_id))
    return report


class _NumberedCanvas(Canvas):
    """Canvas that stamps a 'Page X of Y' footer on every page. ReportLab only
    knows the final page count once the whole document has been drawn, so pages
    are buffered in showPage() and the footer is stamped in save(), once the
    total is known."""

    def __init__(self, *args, **kwargs):
        Canvas.__init__(self, *args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        page_count = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_page_number(page_count)
            Canvas.showPage(self)
        Canvas.save(self)

    def _draw_page_number(self, page_count):
        self.setFont(FONT_ITALIC, 6)
        self.setFillColor(colors.HexColor("#555555"))
        self.drawCentredString(A4[0] / 2, 12 * mm, SYSTEM_GENERATED_NOTE)
        self.setFont(FONT, 6)
        self.drawCentredString(A4[0] / 2, 8 * mm, f"Page {self._pageNumber} of {page_count}")


LAB_ADDRESS_LINES = [
    "<b>AQUACHECK LABORATORIES LIMITED</b>",
    "P.O. Box 216 – 00300, NAIROBI",
    "Westlands Commercial Centre",
    "Off Ring Road, Parklands Rd",
    "Email: info@aquachecklab.com",
    "Website: www.aquachecklab.com",
    "TEL: 0755596064/0734933819",
]
DISCLAIMER_TEXT = (
    "These results only apply to the sample submitted and the recommendations/comments are "
    "only based on the tested parameters."
)
SAMPLING_CLAUSE = (
    " The laboratory will not be held responsible for any sampling errors, which may include "
    "improper collection techniques, contamination during the sampling process, or inadequate "
    "sample representation."
)
REPRODUCTION_NOTE = "The test report shall not be reproduced without the written approval of Aquacheck Laboratories Ltd."

# Report typography (points): Calibri 9 for body and results; the key and
# comments use 10pt headings over 7.5pt text; the disclaimer uses 9pt over 7pt.
_BLACK = colors.black
_HEADER_BG = colors.HexColor("#e0e0e0")
_ZEBRA_BG = colors.HexColor("#d9d9d9")
_REMARK_COLORS = {"non_compliant": "#cc0000", "compliant": "#006600"}
_SIDE_MARGIN = 10 * mm
_CONTENT_WIDTH = A4[0] - 2 * _SIDE_MARGIN


def _styles():
    body = ParagraphStyle("body", fontName=FONT, fontSize=9, leading=11)
    return {
        "body": body,
        "body_right": ParagraphStyle("body_right", parent=body, alignment=2),
        "cell": ParagraphStyle("cell", parent=body, leading=10.5),
        "cell_center": ParagraphStyle("cell_center", parent=body, leading=10.5, alignment=1),
        "head": ParagraphStyle("head", parent=body, fontName=FONT_BOLD, leading=10.5),
        "head_center": ParagraphStyle("head_center", parent=body, fontName=FONT_BOLD, leading=10.5, alignment=1),
        "address": ParagraphStyle("address", parent=body, fontSize=6.75, leading=10, alignment=2, textColor=colors.HexColor("#333333")),
        "report_no": ParagraphStyle("report_no", parent=body, fontSize=7, alignment=2, textColor=colors.HexColor("#555555")),
        "title": ParagraphStyle("title", parent=body, fontName=FONT_BOLD, fontSize=12, leading=15, alignment=1, spaceAfter=6),
        "note_heading": ParagraphStyle("note_heading", parent=body, fontName=FONT_BOLD, fontSize=10, leading=13, spaceBefore=6),
        "note": ParagraphStyle("note", parent=body, fontSize=7.5, leading=10.5),
        # The disclaimer sits a step below the key and comments so it reads as fine print.
        "disclaimer_heading": ParagraphStyle("disclaimer_heading", parent=body, fontName=FONT_BOLD, fontSize=9, leading=11.5, spaceBefore=6),
        "disclaimer": ParagraphStyle("disclaimer", parent=body, fontSize=7, leading=9.5),
        "signer": ParagraphStyle("signer", parent=body, alignment=1),
        "qr_caption": ParagraphStyle("qr_caption", parent=body, fontSize=5.25, leading=7, alignment=1, textColor=colors.HexColor("#666666")),
        "issued": ParagraphStyle("issued", parent=body, fontName=FONT_BOLD, alignment=1),
        "history": ParagraphStyle("history", parent=body, fontSize=6, leading=8, textColor=colors.HexColor("#555555")),
    }


def _report_signers(db: Session, content: dict, signer_ids: Optional[List[int]]):
    """[{name, title, signature_b64}] in print order. Staff can pick who signs a
    printout (signer_ids); otherwise the report's own signatories apply."""
    if signer_ids:
        users = {u.id: u for u in db.query(User).filter(User.id.in_(signer_ids)).all()}
        picked = [users[i] for i in signer_ids if i in users]
        if picked:
            return [
                {
                    "name": u.full_name,
                    "title": u.job_title or u.role.value.replace("_", " "),
                    "signature_b64": u.signature_b64 or None,
                }
                for u in picked
            ]
    signers = resolve_signatories(db, content)
    return [signers["authorizer"], signers["analyst"]]


def _signature_block(sig: dict, styles):
    image = ""
    if sig.get("signature_b64"):
        try:
            # Fit within the box, keeping the signature's own aspect ratio.
            image = RLImage(io.BytesIO(base64.b64decode(sig["signature_b64"])), width=4.5 * cm, height=1.85 * cm, kind="proportional")
        except Exception:
            image = ""
    name = escape(sig.get("name") or "").upper() or "___________________"
    title = escape(sig.get("title") or "") if sig.get("name") else "Authorised Signatory"
    block = Table(
        [[image], [Paragraph(f"<b>{name}</b><br/><i>{title}</i>", styles["signer"])]],
        colWidths=[4.8 * cm],
        rowHeights=[1.95 * cm, None],
    )
    block.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, 0), "BOTTOM"),
        ("LINEABOVE", (0, 1), (-1, 1), 0.75, _BLACK),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 1), (-1, 1), 3),
    ]))
    return block


def _report_sample(report: Report, db: Session) -> Optional[Sample]:
    sample_id = (report.content or {}).get("sample_id")
    return db.query(Sample).filter(Sample.id == sample_id).first() if sample_id else None


def _pdf_name(report: Report, sample: Optional[Sample]) -> str:
    """What the report's PDF is called, without the extension: the sample code, so
    QT/1234/2026 becomes QT-1234-2026. A report with no sample uses its report number."""
    return (sample.sample_code if sample else report.report_number).replace("/", "-")


# How long a preview link works: long enough to keep the preview open while printing.
_PDF_LINK_EXPIRE_MINUTES = 60


@router.post("/{report_id}/pdf-link")
def create_pdf_link(
    report_id: int,
    signers: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """A link to the report PDF that a browser can open without the Authorization header.
    Its path ends in the report's file name, so the browser's PDF viewer and print dialog
    use that name too. The token has no "sub", so it can't be used to log in."""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    _ensure_customer_can_view(report, current_user, db)
    token = create_access_token(
        {"pdf_report": report.id, "pdf_user": current_user.id, "signers": signers},
        timedelta(minutes=_PDF_LINK_EXPIRE_MINUTES),
    )
    filename = f"{_pdf_name(report, _report_sample(report, db))}.pdf"
    return {"path": f"/reports/{report.id}/file/{quote(filename)}?token={token}"}


@router.get("/{report_id}/file/{filename}")
def open_pdf_link(report_id: int, filename: str, token: str, db: Session = Depends(get_db)):
    """The report PDF behind a create_pdf_link link, with the access of the user who
    requested the link. The file name is only there for the browser."""
    payload = decode_access_token(token)
    if payload is None or payload.get("pdf_report") != report_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="This report link has expired.")
    user = db.query(User).filter(User.id == payload.get("pdf_user")).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="This report link has expired.")
    return generate_pdf(report_id, inline=True, signers=payload.get("signers"), db=db, current_user=user)


@router.get("/{report_id}/pdf")
def generate_pdf(
    report_id: int,
    inline: bool = False,
    signers: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The test report. This PDF is the report — the preview, print and download all
    show it. inline opens it in the browser instead of downloading; signers (staff only)
    is a comma-separated list of user ids to sign this printout instead of the report's
    signatories."""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    _ensure_customer_can_view(report, current_user, db)
    signer_ids = None
    if signers and current_user.role != UserRole.customer:
        signer_ids = [int(s) for s in signers.split(",") if s.strip().isdigit()]

    contract = db.query(Contract).filter(Contract.id == report.contract_id).first() if report.contract_id else None
    content = report.content or {}
    sample = _report_sample(report, db)

    # A sample may be linked to a client directly (standalone sample) or through its
    # contract; fall back through both before giving up.
    customer_id = (
        report.customer_id
        or (contract.customer_id if contract else None)
        or (sample.customer_id if sample else None)
    )
    customer = db.query(Customer).filter(Customer.id == customer_id).first() if customer_id else None
    items, result_by_item, qualifiers = load_report_results(db, sample)

    category = getattr(getattr(sample, "sample_category", None), "value", None) if sample else None
    is_paint = category == "paint"
    is_waste = category == "waste"
    show_who, show_remarks = report_options(content, customer, sample)
    result_sections = _result_sections(items, result_by_item, content, sample, qualifiers, show_who)
    spec_header, spec_context, natural = _specification_context(sample, items, content, show_who)
    st = _styles()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        # Browsers offer the PDF's title as the file name when saving from the print dialog.
        buffer, pagesize=A4, title=_pdf_name(report, sample),
        leftMargin=_SIDE_MARGIN, rightMargin=_SIDE_MARGIN, topMargin=10 * mm, bottomMargin=20 * mm,
    )
    # ── Sample details ──
    contact = (
        _content_value(content, "client_contact", None)
        or (sample.contact_person if sample else None)
        or (f"{customer.contact_person}{f' - {customer.phone}' if customer.phone else ''}" if customer and customer.contact_person else None)
        or "—"
    )
    submitted_by = (
        _content_value(content, "submitted_by", None)
        or (customer.name if customer else None)
        or (sample.submitted_by if sample else None)
        or contact
    )
    sampler_name = sample.sampled_by_name if sample else None
    sampled_by_override = _content_value(content, "sampled_by", None)
    sampled_by = sampled_by_override or sampler_name or "AQUACHECK LABORATORIES LTD"
    # Lab-collected samples (no override, the assigned lab sampler, or the lab itself)
    # don't carry the sampling-errors liability clause; client-collected ones do.
    sampled_by_lab = (
        not sampled_by_override
        or sampled_by_override == sampler_name
        or "aquacheck" in sampled_by_override.lower()
    )
    received = _content_value(content, "received_on", sample.received_at if sample else None)
    issued = report.issued_at or _content_value(content, "report_issued_on", None) or datetime.now(timezone.utc)
    issued_on = _format_date(issued)
    description = (
        (sample.description if sample else None)
        or _content_value(content, "sample_description", None)
        or (sample.sample_type if sample else None)
        or "WATER SAMPLE"
    )
    # On reports with WHO limits and no remarks the lab labels this row as the client.
    contact_label = "CLIENT:" if show_who and not show_remarks else "CONTACT PERSON:"
    details = [
        ("SAMPLE DESCRIPTION:", description, "SAMPLING DATE:", _format_date(_content_value(content, "sampling_date", sample.collection_date if sample else None))),
        ("SUBMITTED BY:", submitted_by, "RECEIVED ON:", _format_date(received)),
        (contact_label, contact, "ANALYSIS DATE:", _format_date(_content_value(content, "analysis_date", received))),
        ("SAMPLED BY:", sampled_by, "REPORT ISSUED ON:", issued_on),
        ("SAMPLING LOCATION:", _content_value(content, "sampling_location", sample.collection_location if sample else None) or "—",
         "SAMPLE LAB ID:", _content_value(content, "sample_lab_id", None) or (sample.physical_sample_id if sample else None) or (sample.sample_code if sample else report.report_number)),
    ]

    # ── Key ──
    legend_note = _content_value(content, "ns_definition", None)
    if legend_note:
        key_lines = [escape(legend_note)]
    else:
        entries = (
            _paint_legend_entries(qualifiers, result_sections) if is_paint
            # The swimming-pool specification is a WHO guideline, so WHO is always on it.
            else _legend_entries(qualifiers, is_waste, show_who or category == "swimming_pool")
        )
        key_lines = [", ".join(f"<b>{escape(code)}:</b> {escape(label)}" for code, label in entries) + "."] if entries else []
    marks = mark_legend(result_sections)
    if marks:
        key_lines.append("&nbsp;&nbsp;&nbsp;&nbsp;".join(f"<b>{_mark_markup(mark)}</b> {label}" for mark, label in marks) + ".")

    disclaimer = _content_value(content, "disclaimer", None) or DISCLAIMER_TEXT + ("" if sampled_by_lab else SAMPLING_CLAUSE)
    comments = _comment_paragraphs(content, sample, result_sections, spec_context, natural, show_remarks)
    report_signers = _report_signers(db, content, signer_ids)
    qr_png = None
    if report.public_token:
        default_base = os.environ.get("PUBLIC_BASE_URL", "https://lims.aquachecklab.com")
        public_url = _content_value(content, "public_base_url", default_base).rstrip("/")
        qr_png = base64.b64decode(generate_barcode(f"{public_url}/public/reports/{report.public_token}"))

    # Columns the results tables print, by position: test, method, results, [spec], [WHO], [remarks].
    columns = ["TEST", "METHOD", "RESULTS"]
    if not is_paint:
        columns.append(spec_header)
    if show_who:
        columns.append(WHO_SPEC_HEADER)
    if show_remarks:
        columns.append(PAINT_REMARKS_HEADER if is_paint else "REMARKS")
    widths = {
        (True, False, True): [6.4, 4.6, 3.5, 4.5],
        (False, False, True): [5.9, 4.9, 2.0, 3.3, 2.9],
        (False, True, True): [4.9, 4.2, 1.9, 3.0, 2.3, 2.7],
        (False, False, False): [6.5, 5.5, 2.6, 4.4],
        (False, True, False): [5.8, 4.9, 2.3, 3.0, 3.0],
    }[(is_paint, show_who, show_remarks)]

    # Flowables can only be laid out once, so each page builds its own copies.
    def header_flowables():
        if _LOGO_PATH.is_file():
            logo = RLImage(str(_LOGO_PATH), width=6 * cm, height=1.6 * cm, kind="proportional")
            logo.hAlign = "LEFT"
        else:
            logo = Paragraph("<b>AQUACHECK</b>", st["title"])
        header = Table(
            [[logo, Paragraph("<br/>".join(LAB_ADDRESS_LINES), st["address"])]],
            colWidths=[_CONTENT_WIDTH / 2] * 2,
        )
        header.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("LINEBELOW", (0, 0), (-1, 0), 1.5, _BLACK),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        amended = ' <font color="#b45309">[AMENDED]</font>' if report.status == ReportStatus.amended else ""

        detail_rows = [
            [Paragraph(f"<b>{label}</b>", st["body"]), Paragraph(escape(str(value)).upper(), st["body"]),
             Paragraph(f"<b>{label2}</b>", st["body_right"]), Paragraph(escape(str(value2)), st["body_right"])]
            for label, value, label2, value2 in details
        ]
        detail_style = [
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 1.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            # The right-hand block ends flush with the results table's right edge.
            ("RIGHTPADDING", (3, 0), (3, -1), 0),
        ]
        if sample and sample.notes:
            detail_rows.append([Paragraph("<b>NOTES:</b>", st["body"]), Paragraph(escape(sample.notes), st["body"]), "", ""])
            detail_style.append(("SPAN", (1, len(detail_rows) - 1), (3, len(detail_rows) - 1)))
        # The right-hand values are short (dates, lab ID): their column is sized to the
        # longest one so the block sits against the right edge, beside its labels, and
        # the spare width goes to the left-hand values.
        value2_width = max(stringWidth(str(value2), FONT, 9) for _, _, _, value2 in details) + 3 + 1
        value2_width = min(max(value2_width, 1.8 * cm), 4.5 * cm)
        details_table = Table(
            detail_rows,
            colWidths=[3.4 * cm, _CONTENT_WIDTH - 6.9 * cm - value2_width, 3.5 * cm, value2_width],
        )
        details_table.setStyle(TableStyle(detail_style))
        return [
            header,
            Paragraph(f"Report No: <b>{escape(report.report_number)}</b>{amended}", st["report_no"]),
            Paragraph(f"<u>{escape(_content_value(content, 'report_title', 'TEST REPORT'))}</u>", st["title"]),
            details_table,
            Spacer(1, 8),
        ]

    def results_flowables(sections):
        # The first section's title heads the TEST column instead of taking a row of its
        # own; later sections get a divider row. Effluent reports print one plain list.
        page_columns = list(columns)
        if sections and not is_waste:
            page_columns[0] = sections[0]["title"]
        rows = [[Paragraph(escape(page_columns[0]).upper(), st["head"])] + [
            Paragraph(escape(c).replace("\n", "<br/>"), st["head_center"]) for c in page_columns[1:]
        ]]
        table_style = [
            ("GRID", (0, 0), (-1, -1), 0.75, _BLACK),
            ("BACKGROUND", (0, 0), (-1, 0), _HEADER_BG),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 1.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]
        for section_index, section in enumerate(sections):
            if not is_waste and section_index > 0:
                rows.append([Paragraph(escape(section["title"]).upper(), st["head"])] + [""] * (len(columns) - 1))
                table_style += [("SPAN", (0, len(rows) - 1), (-1, len(rows) - 1)), ("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), _HEADER_BG)]
            for item_index, row in enumerate(section.get("rows", [])):
                mark = row.get("mark")
                name = escape(str(row.get("parameter") or "—"))
                cells = [
                    Paragraph(f"{name} <b>{_mark_markup(mark)}</b>" if mark else name, st["cell"]),
                    Paragraph(escape(str(row.get("method") or "—")), st["cell"]),
                    Paragraph(escape(str(row.get("result") or "—")), st["cell_center"]),
                ]
                if not is_paint:
                    cells.append(Paragraph(escape(str(row.get("specification") or "NS")), st["cell_center"]))
                if show_who:
                    cells.append(Paragraph(escape(str(row.get("who_specification") or "NS")), st["cell_center"]))
                if show_remarks:
                    kind = _remark_kind(row)
                    text = escape(str(row.get("remarks") or "—"))
                    if kind == "non_compliant":
                        text = f"<b>{text}</b>"
                    elif kind == "not_tested":
                        text = f"<i>{text}</i>"
                    if kind in _REMARK_COLORS:
                        text = f'<font color="{_REMARK_COLORS[kind]}">{text}</font>'
                    cells.append(Paragraph(text, st["cell_center"]))
                rows.append(cells)
                if item_index % 2 == 0:
                    table_style.append(("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), _ZEBRA_BG))
        results_table = Table(rows, colWidths=[w * cm for w in widths], repeatRows=1)
        results_table.setStyle(TableStyle(table_style))
        flowables = [results_table]
        if len(rows) == 1:
            flowables.append(Paragraph("No tests are linked to this report yet.", st["note"]))
        return flowables

    def closing_flowables():
        flowables = [Spacer(1, 4)]
        # ── Key ──
        if key_lines:
            flowables.append(Paragraph("<u>KEY</u>", st["note_heading"]))
            flowables += [Paragraph(line, st["note"]) for line in key_lines]

        # ── Disclaimer ──
        flowables.append(Paragraph("<u>DISCLAIMER</u>", st["disclaimer_heading"]))
        flowables.append(Paragraph(escape(disclaimer), st["disclaimer"]))
        flowables.append(Paragraph(REPRODUCTION_NOTE, st["disclaimer"]))

        # ── Comments ──
        if comments:
            flowables.append(Paragraph("<u>COMMENTS.</u>", st["note_heading"]))
            flowables += [Paragraph(escape(text), st["note"]) for text in comments]

        # ── Signatures, with the issue date and QR code in the middle column ──
        blocks = [_signature_block(sig, st) for sig in report_signers]
        half = (len(blocks) + 1) // 2
        middle = []
        if qr_png:
            middle += [
                RLImage(io.BytesIO(qr_png), width=1.7 * cm, height=1.7 * cm),
                Paragraph("Scan to verify", st["qr_caption"]),
            ]
        middle.append(Paragraph(issued_on, st["issued"]))
        signatures = Table(
            [[blocks[:half] or "", middle, blocks[half:] or ""]],
            colWidths=[6.5 * cm, _CONTENT_WIDTH - 13 * cm, 6.5 * cm],
        )
        signatures.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ]))
        flowables.append(Spacer(1, 24))
        flowables.append(KeepTogether([signatures]))

        # ── Revision history ──
        history = report.revision_history or []
        if history:
            entries = []
            for entry in reversed(history):
                when = _format_date(entry.get("timestamp"))
                if entry.get("timestamp"):
                    try:
                        when = datetime.fromisoformat(entry["timestamp"]).astimezone(_LAB_TZ).strftime("%d %b %Y %H:%M")
                    except ValueError:
                        pass
                text = f"<b>{escape(str(entry.get('action') or '').upper())}</b> — {when}"
                if entry.get("reason"):
                    text += f" — {escape(str(entry['reason']))}"
                entries.append(text)
            history_table = Table(
                [[Paragraph("<b>REVISION HISTORY:</b> " + "; ".join(entries), st["history"])]],
                colWidths=[_CONTENT_WIDTH],
            )
            history_table.setStyle(TableStyle([
                ("LINEABOVE", (0, 0), (-1, 0), 0.5, colors.HexColor("#cccccc")),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
            ]))
            flowables.append(Spacer(1, 6))
            flowables.append(history_table)
        return flowables

    # The microbiological results (and any sections after them) print on a page of
    # their own, under the same header, sample details, notes and signatures.
    page_sections = [result_sections]
    if not is_waste:
        micro_start = next(
            (i for i, section in enumerate(result_sections)
             if i > 0 and str(section.get("title") or "").strip().lower() in _MICRO_SECTION_TITLES),
            None,
        )
        if micro_start is not None:
            page_sections = [result_sections[:micro_start], result_sections[micro_start:]]

    story = []
    for page_index, sections in enumerate(page_sections):
        if page_index:
            story.append(PageBreak())
        story += header_flowables()
        story += results_flowables(sections)
        story += closing_flowables()

    doc.build(story, canvasmaker=_NumberedCanvas)
    buffer.seek(0)
    disposition = "inline" if inline else "attachment"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{_pdf_name(report, sample)}.pdf"'},
    )
