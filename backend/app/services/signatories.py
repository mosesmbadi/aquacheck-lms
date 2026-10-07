"""Report signatories: the two staff members who sign every test report.

The authorizer signs on the left, the analyst on the right. Each slot is held by at
most one user (users.report_signatory) and is changed from the Admin page. Issuing a
report freezes the signatories onto it, so a later change can't alter what was issued.
"""
import secrets
from typing import Dict, Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User, UserRole

SLOTS = ("authorizer", "analyst")

# The lab's signatories, created on first start so reports are signed out of the box.
DEFAULT_SIGNATORIES = [
    {
        "slot": "authorizer",
        "email": "victor.mutai@aquachecklab.com",
        "full_name": "Victor Mutai",
        "job_title": "Water Chemist",
        "role": UserRole.manager,
    },
    {
        "slot": "analyst",
        "email": "kipkemoi.josphat@aquachecklab.com",
        "full_name": "Kipkemoi Josphat",
        "job_title": "Lab analyst",
        "role": UserRole.technician,
    },
]


def seed_signatories(db: Session) -> None:
    """Create the default signatory accounts if missing, and give each its slot when
    no one holds it yet. Never overrides a slot an admin has reassigned."""
    from app.services.auth import get_password_hash

    for spec in DEFAULT_SIGNATORIES:
        user = db.query(User).filter(User.email == spec["email"]).first()
        if not user:
            password = settings.STAFF_DEFAULT_PASSWORD or secrets.token_urlsafe(9)
            user = User(
                email=spec["email"],
                full_name=spec["full_name"],
                job_title=spec["job_title"],
                role=spec["role"],
                hashed_password=get_password_hash(password),
                is_active=True,
            )
            db.add(user)
            db.flush()
            if settings.STAFF_DEFAULT_PASSWORD:
                print(f"[LIMS] Signatory account created: {spec['email']} (password: STAFF_DEFAULT_PASSWORD)")
            else:
                print(f"[LIMS] Signatory account created: {spec['email']} / {password} — change it after first login.")
        slot_taken = db.query(User).filter(User.report_signatory == spec["slot"]).first()
        if not slot_taken:
            user.report_signatory = spec["slot"]
    db.commit()


def configured_signatories(db: Session) -> Dict[str, Optional[User]]:
    users = (
        db.query(User)
        .filter(User.report_signatory.in_(SLOTS), User.is_active == True)  # noqa: E712
        .all()
    )
    by_slot = {u.report_signatory: u for u in users}
    return {slot: by_slot.get(slot) for slot in SLOTS}


def signatory_entry(user: User) -> dict:
    return {
        "user_id": user.id,
        "name": user.full_name,
        "title": user.job_title or "",
        "signature_b64": user.signature_b64 or None,
    }


def frozen_signatories(db: Session) -> dict:
    """The current signatories in the shape stored on an issued report."""
    return {
        slot: signatory_entry(user) if user else None
        for slot, user in configured_signatories(db).items()
    }


def resolve_signatories(db: Session, content: dict) -> Dict[str, dict]:
    """Who signs this report, per slot: the signatories frozen at issue, else the
    configured ones. A name typed on the report (authorizer_name / analyst_name)
    overrides the slot; the stored signature is only kept when it is the same person."""
    content = content or {}
    frozen = content.get("signatories")
    base = frozen if isinstance(frozen, dict) else frozen_signatories(db)
    resolved = {}
    for slot in SLOTS:
        entry = base.get(slot) or {}
        override_name = (content.get(f"{slot}_name") or "").strip()
        same_person = not override_name or override_name.lower() == (entry.get("name") or "").lower()
        resolved[slot] = {
            "name": override_name or entry.get("name") or "",
            "title": (content.get(f"{slot}_title") or "").strip() or (entry.get("title") if same_person else "") or "",
            "signature_b64": entry.get("signature_b64") if same_person else None,
        }
    return resolved
