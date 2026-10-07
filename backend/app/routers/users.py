from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user, require_role
from app.models.user import User, UserRole
from app.schemas.user import UserOut, UserUpdate, ReportSignatoriesUpdate, ReportSignatoriesOut
from app.services.access import ensure_staff
from app.services.auth import get_password_hash
from app.services.audit import log_action
from app.services.signatories import configured_signatories

router = APIRouter(prefix="/users", tags=["Users"])

_SELF_EDITABLE = {"full_name", "job_title", "signature_b64"}


@router.get("", response_model=List[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_role(UserRole.admin, UserRole.manager)),
):
    return db.query(User).all()


# Declared before /{user_id}, which would otherwise capture these paths.
@router.get("/report-signatories", response_model=ReportSignatoriesOut)
def get_report_signatories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_staff(current_user)
    return configured_signatories(db)


@router.put("/report-signatories", response_model=ReportSignatoriesOut)
def set_report_signatories(
    payload: ReportSignatoriesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
):
    wanted = {"authorizer": payload.authorizer_id, "analyst": payload.analyst_id}
    if payload.authorizer_id and payload.authorizer_id == payload.analyst_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The two signatories must be different people.")
    for slot, user_id in wanted.items():
        if user_id is None:
            continue
        user = db.query(User).filter(User.id == user_id).first()
        if not user or not user.is_active or user.role == UserRole.customer:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"The {slot} must be an active staff user.")
    for slot, user_id in wanted.items():
        db.query(User).filter(User.report_signatory == slot).update({User.report_signatory: None})
        if user_id is not None:
            db.query(User).filter(User.id == user_id).update({User.report_signatory: slot})
    db.commit()
    log_action(db, current_user.id, "UPDATE_REPORT_SIGNATORIES", "user", f"{payload.authorizer_id},{payload.analyst_id}")
    return configured_signatories(db)


@router.get("/{user_id}", response_model=UserOut)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Allow self-lookup or admin/manager
    if current_user.id != user_id and current_user.role not in [UserRole.admin, UserRole.manager]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    is_admin = current_user.role == UserRole.admin
    if current_user.id != user_id and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    update_data = payload.model_dump(exclude_unset=True)
    # Passwords, roles, account status and customer links are admin-only; a user
    # editing their own account may only change how they appear on reports.
    if not is_admin:
        restricted = set(update_data) - _SELF_EDITABLE
        if restricted:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Only an administrator can change: {', '.join(sorted(restricted))}",
            )
    if "password" in update_data:
        new_password = update_data.pop("password") or ""
        if len(new_password) < 6:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 6 characters")
        update_data["hashed_password"] = get_password_hash(new_password)
        log_action(db, current_user.id, "RESET_USER_PASSWORD", "user", str(user_id))
    if "customer_id" in update_data and update_data["customer_id"] is not None:
        from app.models.customer import Customer
        if not db.query(Customer).filter(Customer.id == update_data["customer_id"]).first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")
    for k, v in update_data.items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    log_action(db, current_user.id, "UPDATE_USER", "user", str(user_id))
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    db.delete(user)
    db.commit()
    log_action(db, current_user.id, "DELETE_USER", "user", str(user_id))
