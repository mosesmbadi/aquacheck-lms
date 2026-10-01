"""Customer data boundaries: a customer user sees only their own company's samples, and
their results only once the lab has released them on an issued test report."""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models.contract import Contract
from app.models.report import Report, ReportStatus
from app.models.sample import Sample
from app.models.user import User, UserRole


def is_customer(user: User) -> bool:
    return user.role == UserRole.customer


def ensure_staff(user: User) -> None:
    if is_customer(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not permitted for customer accounts.")


def customer_owns_sample(user: User, sample: Sample, db: Session) -> bool:
    if not user.customer_id:
        return False
    if sample.customer_id == user.customer_id:
        return True
    if sample.contract_id:
        contract = db.query(Contract).filter(Contract.id == sample.contract_id).first()
        return bool(contract and contract.customer_id == user.customer_id)
    return False


def ensure_can_view_sample(user: User, sample: Sample, db: Session) -> None:
    # 404 rather than 403, so customers can't probe which sample ids exist.
    if is_customer(user) and not customer_owns_sample(user, sample, db):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")


def results_released(sample_id: int, db: Session) -> bool:
    """True once the sample has an issued (or amended) test report."""
    return db.query(Report.id).filter(
        Report.content["sample_id"].as_integer() == sample_id,
        Report.status.in_((ReportStatus.issued, ReportStatus.amended)),
    ).first() is not None


def customer_can_see_results(user: User, sample: Sample, db: Session) -> bool:
    return customer_owns_sample(user, sample, db) and results_released(sample.id, db)
