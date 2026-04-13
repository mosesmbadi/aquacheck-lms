from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user, require_role
from app.models.user import User, UserRole
from app.models.contract import Contract
from app.models.sample import Sample, SampleStatus
from app.models.test_result import TestResult, TestStatus
from app.models.test_catalog import TestCatalogItem
from app.schemas.test_result import TestResultCreate, TestResultUpdate, TestResultOut, UncertaintyResult, BulkResultCreate
from app.services.audit import log_action
from app.services.uncertainty import calculate_uncertainty
from app.routers.inventory import deduct_reagents_for_test_result

router = APIRouter(prefix="/test-results", tags=["Test Results"])


def _maybe_complete_sample(sample: Sample, db: Session) -> None:
    """Mark sample as completed if every requested test has a validated result."""
    requested_ids: list[int] = sample.requested_test_ids or []
    if not requested_ids:
        return
    # flush so the just-validated result is visible in this transaction
    db.flush()
    validated_ids = {
        tr.catalog_item_id
        for tr in db.query(TestResult).filter(
            TestResult.sample_id == sample.id,
            TestResult.status == TestStatus.validated,
            TestResult.catalog_item_id.isnot(None),
        ).all()
    }
    if all(rid in validated_ids for rid in requested_ids):
        sample.status = SampleStatus.completed


@router.get("", response_model=List[TestResultOut])
def list_test_results(
    sample_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(TestResult)
    if sample_id is not None:
        q = q.filter(TestResult.sample_id == sample_id)
    return q.order_by(TestResult.created_at.desc()).all()


@router.post("", response_model=TestResultOut, status_code=status.HTTP_201_CREATED)
def create_test_result(
    payload: TestResultCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sample = db.query(Sample).filter(Sample.id == payload.sample_id).first()
    if not sample:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
    if not sample.contract_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sample must be linked to a contract before testing")

    contract = db.query(Contract).filter(Contract.id == sample.contract_id).first()
    if not contract:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sample contract not found")

    tr = TestResult(**payload.model_dump(), started_at=datetime.now(timezone.utc))
    if tr.status == TestStatus.pending:
        tr.status = TestStatus.in_progress

    if sample.status in {SampleStatus.received, SampleStatus.registered, SampleStatus.assigned}:
        sample.status = SampleStatus.in_testing

    db.add(tr)
    db.flush()
    # Auto-deduct reagents if a result value was provided on creation
    if tr.result_value and tr.catalog_item_id:
        deduct_reagents_for_test_result(db, tr.id, tr.catalog_item_id, current_user.id)
    db.commit()
    db.refresh(tr)
    log_action(db, current_user.id, "CREATE_TEST_RESULT", "test_result", str(tr.id))
    return tr


@router.get("/{result_id}", response_model=TestResultOut)
def get_test_result(result_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    tr = db.query(TestResult).filter(TestResult.id == result_id).first()
    if not tr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test result not found")
    return tr


@router.put("/{result_id}", response_model=TestResultOut)
def update_test_result(
    result_id: int,
    payload: TestResultUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tr = db.query(TestResult).filter(TestResult.id == result_id).first()
    if not tr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test result not found")
    had_value = bool(tr.result_value)
    update_data = payload.model_dump(exclude_unset=True)
    # If result_value is set, mark completed
    if "result_value" in update_data and update_data["result_value"] and tr.status == TestStatus.in_progress:
        tr.status = TestStatus.completed
        tr.completed_at = datetime.now(timezone.utc)
    for k, v in update_data.items():
        setattr(tr, k, v)
    # Deduct reagents on first-time completion (value added)
    if not had_value and tr.result_value and tr.catalog_item_id:
        deduct_reagents_for_test_result(db, tr.id, tr.catalog_item_id, current_user.id)
    db.commit()
    db.refresh(tr)
    log_action(db, current_user.id, "UPDATE_TEST_RESULT", "test_result", str(result_id))
    return tr


@router.post("/{result_id}/validate", response_model=TestResultOut)
def validate_test_result(
    result_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.quality_manager)),
):
    tr = db.query(TestResult).filter(TestResult.id == result_id).first()
    if not tr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test result not found")
    if tr.status not in [TestStatus.completed, TestStatus.in_progress]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Test must be completed before validation")
    tr.status = TestStatus.validated
    tr.validated_by = current_user.id
    tr.validated_at = datetime.now(timezone.utc)

    # Auto-complete sample if all requested tests are now validated
    sample = db.query(Sample).filter(Sample.id == tr.sample_id).first()
    if sample:
        _maybe_complete_sample(sample, db)

    db.commit()
    db.refresh(tr)
    log_action(db, current_user.id, "VALIDATE_TEST_RESULT", "test_result", str(result_id))
    return tr


@router.post("/{result_id}/calculate-uncertainty", response_model=UncertaintyResult)
def calc_uncertainty(
    result_id: int,
    values: List[float] = Body(..., embed=True),
    coverage_factor: float = Body(2.0, embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tr = db.query(TestResult).filter(TestResult.id == result_id).first()
    if not tr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test result not found")
    result = calculate_uncertainty(values, coverage_factor)
    # Store in the test result
    tr.uncertainty_value = result["expanded_uncertainty"]
    tr.uncertainty_unit = tr.result_unit or ""
    db.commit()
    return UncertaintyResult(**result)


@router.post("/bulk", response_model=List[TestResultOut])
def bulk_upsert_results(
    payload: BulkResultCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create or update test results for a sample in bulk (one row per catalog item)."""
    sample = db.query(Sample).filter(Sample.id == payload.sample_id).first()
    if not sample:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")

    # Index existing results by catalog_item_id for this sample
    existing = (
        db.query(TestResult)
        .filter(TestResult.sample_id == payload.sample_id, TestResult.catalog_item_id.isnot(None))
        .all()
    )
    by_catalog = {tr.catalog_item_id: tr for tr in existing}

    results: list[TestResult] = []
    newly_completed: list[TestResult] = []  # for reagent deduction
    now = datetime.now(timezone.utc)

    for row in payload.rows:
        # Skip rows with no result entered
        if not row.result_value:
            continue

        catalog = db.query(TestCatalogItem).filter(TestCatalogItem.id == row.catalog_item_id).first()
        unit = catalog.unit if catalog else ""

        if row.catalog_item_id in by_catalog:
            # Update existing
            tr = by_catalog[row.catalog_item_id]
            had_value = bool(tr.result_value)
            tr.result_value = row.result_value
            tr.result_unit = unit
            tr.notes = row.notes or tr.notes
            if tr.status == TestStatus.pending or tr.status == TestStatus.in_progress:
                tr.status = TestStatus.completed
                tr.completed_at = now
            if not had_value and tr.result_value:
                newly_completed.append(tr)
        else:
            # Create new
            tr = TestResult(
                sample_id=payload.sample_id,
                catalog_item_id=row.catalog_item_id,
                result_value=row.result_value,
                result_unit=unit,
                notes=row.notes,
                status=TestStatus.completed if row.result_value else TestStatus.in_progress,
                started_at=now,
                completed_at=now if row.result_value else None,
            )
            db.add(tr)
            if row.result_value:
                newly_completed.append(tr)
        results.append(tr)

    # Update sample status to in_testing if not already further along
    if results and sample.status in {
        SampleStatus.received, SampleStatus.registered, SampleStatus.assigned
    }:
        sample.status = SampleStatus.in_testing

    # Auto-complete sample if all requested tests happen to be validated already
    _maybe_complete_sample(sample, db)

    # Flush so new TestResult rows get IDs, then auto-deduct reagents
    db.flush()
    for tr in newly_completed:
        if tr.catalog_item_id and tr.id:
            deduct_reagents_for_test_result(db, tr.id, tr.catalog_item_id, current_user.id)

    db.commit()
    for tr in results:
        db.refresh(tr)

    log_action(db, current_user.id, "BULK_RESULTS", "sample", str(payload.sample_id))
    return results
