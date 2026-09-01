import os
import uuid
import tempfile
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user, require_role
from app.models.user import User, UserRole
from app.models.document import Document, DocumentCategory, DocumentStatus
from app.schemas.document import DocumentOut, DocumentCreate, DocumentUpdate
from app.services.audit import log_action
from app.services.document_service import extract_sections, generate_pdf

UPLOAD_BASE = Path(os.environ.get("UPLOAD_DIR", str(Path(__file__).parent.parent.parent / "uploads")))
DOCS_UPLOAD_DIR = UPLOAD_BASE / "documents"
MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB

router = APIRouter(prefix="/documents", tags=["Documents"])

DOCS_SOURCE = os.environ.get("DOCS_SOURCE_PATH", "/app/docs_source")

_SEED_DATA = [
    # ── SOPs ─────────────────────────────────────────────────────────────────
    {"code": "SOP-02", "title": "Control of Records and Information Procedure",       "category": DocumentCategory.sop, "version": "2.0",
     "source": "aquachecklabdocumentssops/SOP NO-02 CONTROL OF RECORDS AND INFORMATION PROCEDURE_ REVISED VERSION 02.docx"},
    {"code": "SOP-03", "title": "Control and Approval of Documents Procedures",       "category": DocumentCategory.sop, "version": "1.0",
     "source": "aquachecklabdocumentssops/SOP NO-03 CONTROL AND APPROVAL OFDOCUMENTS PROCEDURES.docx"},
    {"code": "SOP-04", "title": "Complaints Management Procedure",                    "category": DocumentCategory.sop, "version": "1.0",
     "source": "aquachecklabdocumentssops/SOP NO-04 COMPLAINTS MANAGEMENT PROCEDURE.docx"},
    {"code": "SOP-05", "title": "Internal Audit and Systems Review Procedure",        "category": DocumentCategory.sop, "version": "1.0",
     "source": "aquachecklabdocumentssops/SOP NO-05 INTERNAL AUDIT AND SYSTEMS REVIEW PROCEDURE_AQC.docx"},
    {"code": "SOP-06", "title": "Continuous Improvement Process Procedure",           "category": DocumentCategory.sop, "version": "1.0",
     "source": "aquachecklabdocumentssops/SOP NO-06 CONTINOUS IMPROVEMENT PROCESS PROCEDURE.docx"},
    {"code": "SOP-07", "title": "Customer Services Management Procedure",             "category": DocumentCategory.sop, "version": "1.0",
     "source": "aquachecklabdocumentssops/SOP NO-07 CUSTOMER SERVICES MANAGEMENT  PROCEDURE.docx"},
    {"code": "SOP-08", "title": "Purchasing and Supply Services",                     "category": DocumentCategory.sop, "version": "2.0",
     "source": "aquachecklabdocumentssops/SOP NO-08 PURCHASING AND SUPPLY SERVICES _ REVISION 02.docx"},
    {"code": "SOP-09", "title": "Quality Control Schemes Procedure",                  "category": DocumentCategory.sop, "version": "1.0",
     "source": "aquachecklabdocumentssops/SOP NO-09 QUALITY CONTROL SCHEMES PROCEDURE.docx"},
    {"code": "SOP-10", "title": "Equipment Management Procedure",                     "category": DocumentCategory.sop, "version": "1.0",
     "source": "aquachecklabdocumentssops/SOP NO-10 EQUIPMENT MANAGEMENT  PROCEDURE.docx"},
    {"code": "SOP-11", "title": "Quality Assurance System Procedure",                 "category": DocumentCategory.sop, "version": "1.0",
     "source": "aquachecklabdocumentssops/SOP NO-11 QUALITY ASSURANCE SYSTEM PROCEDURE.docx"},
    {"code": "SOP-12", "title": "Method Validation Procedure",                        "category": DocumentCategory.sop, "version": "1.0",
     "source": "aquachecklabdocumentssops/SOP NO-12 METHOD VALIDATION PROCEDURE.docx"},
    {"code": "SOP-13", "title": "Staff Training and Development",                     "category": DocumentCategory.sop, "version": "1.0",
     "source": "aquachecklabdocumentssops/SOP NO-13 STAFF TRAINING AND DEVELOPMENT.docx"},
    {"code": "SOP-14", "title": "Waste Disposal Procedure",                           "category": DocumentCategory.sop, "version": "1.0",
     "source": "aquachecklabdocumentssops/SOP NO-14 WASTE DISPOSAL PROCEDURE.docx"},
    {"code": "SOP-15", "title": "Review of Requests, Tenders and Contracts",          "category": DocumentCategory.sop, "version": "1.0",
     "source": "aquachecklabdocumentssops/SOP NO-15 REVIEW OF REQUETS, TENDERS & CONTRACTS.docx"},
    {"code": "SOP-16", "title": "Subcontracting of Tests",                            "category": DocumentCategory.sop, "version": "1.0",
     "source": "aquachecklabdocumentssops/SOP NO-16, SUBCONTRACTING OF TESTS.docx"},
    {"code": "SOP-17", "title": "Sample Collection, Handling and Storage Procedure",  "category": DocumentCategory.sop, "version": "1.0",
     "source": "aquachecklabdocumentssops/SOP NO-17 SAMPLE COLLECTION,HANDLING AND STORAGE PROCEDURE.docx"},
    {"code": "SOP-18", "title": "Chain of Custody Procedure",                         "category": DocumentCategory.sop, "version": "1.0",
     "source": "aquachecklabdocumentssops/SOP NO-18 CHAIN OF CUSTODY PROCEDURE.docx"},
    {"code": "SOP-19", "title": "Sample Reception and Handling Procedure",            "category": DocumentCategory.sop, "version": "1.0",
     "source": "aquachecklabdocumentssops/SOP NO-19 SAMPLE RECEPTION AND HANDLING  PROCEDURE.docx"},
    # ── Master Lists ─────────────────────────────────────────────────────────
    {"code": "AQCMSTR01", "title": "Master List of External Documents", "category": DocumentCategory.masterlist, "version": "1.0",
     "source": "aquachecklabdocumentsmasterlists/AQCMSTR01 \u2013 MASTER LIST OF EXTERNAL DOCUMENTS.docx"},
    {"code": "AQCMSTR02", "title": "Master List of Equipment",          "category": DocumentCategory.masterlist, "version": "1.0",
     "source": "aquachecklabdocumentsmasterlists/AQCMSTR02 \u2013 MASTERLIST OF EQUIPMENT-NEW.docx"},
    {"code": "AQCMSTR03", "title": "Master List of Forms",              "category": DocumentCategory.masterlist, "version": "1.0",
     "source": "aquachecklabdocumentsmasterlists/AQCMSTR03-MASTERLIST OF FORMS.docx"},
    {"code": "AQCMSTR04", "title": "Master List of SOPs",               "category": DocumentCategory.masterlist, "version": "1.0",
     "source": "aquachecklabdocumentsmasterlists/AQCMSTR04-MASTERLIST OF SOPS.docx"},
]


def seed_documents(db: Session) -> int:
    added = 0
    for entry in _SEED_DATA:
        doc = db.query(Document).filter(Document.code == entry["code"]).first()
        if doc:
            # Re-extract content if empty (e.g. after a DB reset)
            if not doc.content:
                docx_path = os.path.join(DOCS_SOURCE, entry["source"])
                if os.path.exists(docx_path):
                    doc.content = extract_sections(docx_path)
            continue

        content: list = []
        docx_path = os.path.join(DOCS_SOURCE, entry["source"])
        if os.path.exists(docx_path):
            try:
                content = extract_sections(docx_path)
            except Exception as e:
                print(f"[LIMS] Warning: could not parse {entry['code']}: {e}")

        db.add(Document(
            code=entry["code"],
            title=entry["title"],
            category=entry["category"],
            version=entry["version"],
            status=DocumentStatus.active,
            content=content,
        ))
        added += 1

    db.commit()
    return added


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("", response_model=DocumentOut, status_code=201)
def create_document(
    payload: DocumentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
):
    if db.query(Document).filter(Document.code == payload.code).first():
        raise HTTPException(status_code=400, detail="A document with this code already exists.")
    content = [s.model_dump() for s in payload.content] if payload.content else []
    doc = Document(
        code=payload.code,
        title=payload.title,
        category=payload.category,
        version=payload.version,
        status=payload.status,
        effective_date=payload.effective_date,
        description=payload.description,
        content=content,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    log_action(db, current_user.id, "CREATE_DOCUMENT", "document", str(doc.id))
    return doc


@router.post("/{document_id}/upload", response_model=DocumentOut)
async def upload_document_file(
    document_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in (".pdf", ".docx"):
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are accepted.")

    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 20 MB upload limit.")

    if ext == ".docx":
        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        try:
            doc.content = extract_sections(tmp_path)
        finally:
            os.unlink(tmp_path)
        doc.uploaded_file = None
    else:
        DOCS_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        safe_name = f"{document_id}_{uuid.uuid4().hex}.pdf"
        dest = DOCS_UPLOAD_DIR / safe_name
        dest.write_bytes(data)
        if doc.uploaded_file and os.path.exists(doc.uploaded_file):
            try:
                os.unlink(doc.uploaded_file)
            except OSError:
                pass
        doc.uploaded_file = str(dest)

    db.commit()
    db.refresh(doc)
    log_action(db, current_user.id, "UPLOAD_DOCUMENT_FILE", "document", str(document_id))
    return doc


@router.get("", response_model=List[DocumentOut])
def list_documents(
    category: Optional[DocumentCategory] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Document)
    if category:
        q = q.filter(Document.category == category)
    return q.order_by(Document.code).all()


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(
    document_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return doc


@router.get("/{document_id}/pdf")
def get_document_pdf(
    document_id: int,
    download: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Stream a PDF for inline preview or download. Serves uploaded file if present."""
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    if doc.uploaded_file and os.path.exists(doc.uploaded_file):
        with open(doc.uploaded_file, "rb") as f:
            pdf_bytes = f.read()
    else:
        pdf_bytes = generate_pdf(
            code=doc.code,
            title=doc.title,
            version=doc.version,
            status=doc.status.value,
            effective_date=str(doc.effective_date) if doc.effective_date else None,
            sections=doc.content or [],
        )

    disposition = "attachment" if download else "inline"
    filename = f"{doc.code}_v{doc.version}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )


@router.put("/{document_id}", response_model=DocumentOut)
def update_document(
    document_id: int,
    payload: DocumentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "content" in update_data and update_data["content"] is not None:
        # Convert pydantic models to plain dicts for JSON storage
        update_data["content"] = [s.model_dump() for s in payload.content]  # type: ignore[union-attr]

    for k, v in update_data.items():
        setattr(doc, k, v)

    db.commit()
    db.refresh(doc)
    log_action(db, current_user.id, "UPDATE_DOCUMENT", "document", str(document_id))
    return doc
