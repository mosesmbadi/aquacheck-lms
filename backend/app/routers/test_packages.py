from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.deps import get_db, get_current_user, require_role
from app.models.user import UserRole
from app.models.test_catalog import TestCatalogItem
from app.models.test_package import TestPackage, TestPackageItem
from app.schemas.test_package import TestPackageCreate, TestPackageUpdate, TestPackageOut, TestPackageItemOut

router = APIRouter(prefix="/test-packages", tags=["Test Packages"])


def _to_out(pkg: TestPackage) -> TestPackageOut:
    items_out = []
    catalog_ids = []
    for pi in pkg.items:
        ci = pi.catalog_item
        items_out.append(TestPackageItemOut(
            id=pi.id,
            catalog_item_id=pi.catalog_item_id,
            catalog_item_name=ci.name if ci else None,
            catalog_item_category=ci.category if ci else None,
        ))
        catalog_ids.append(pi.catalog_item_id)
    return TestPackageOut(
        id=pkg.id,
        name=pkg.name,
        description=pkg.description,
        price=float(pkg.price or 0),
        is_active=pkg.is_active,
        items=items_out,
        catalog_item_ids=catalog_ids,
        created_at=pkg.created_at,
        updated_at=pkg.updated_at,
    )


@router.get("", response_model=List[TestPackageOut])
def list_packages(
    active_only: bool = True,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(TestPackage)
    if active_only:
        q = q.filter(TestPackage.is_active == True)  # noqa: E712
    return [_to_out(p) for p in q.order_by(TestPackage.name).all()]


@router.post("", response_model=TestPackageOut, status_code=status.HTTP_201_CREATED)
def create_package(
    payload: TestPackageCreate,
    db: Session = Depends(get_db),
    _=Depends(require_role(UserRole.admin, UserRole.manager)),
):
    if not payload.catalog_item_ids:
        raise HTTPException(status_code=400, detail="A package must include at least one test.")

    existing = db.query(TestPackage).filter(TestPackage.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=409, detail="A package with that name already exists.")

    # Validate all catalog items exist
    for cid in payload.catalog_item_ids:
        if not db.query(TestCatalogItem).filter(TestCatalogItem.id == cid).first():
            raise HTTPException(status_code=404, detail=f"Catalog item {cid} not found.")

    pkg = TestPackage(name=payload.name, description=payload.description, price=payload.price)
    db.add(pkg)
    db.flush()

    for cid in payload.catalog_item_ids:
        db.add(TestPackageItem(package_id=pkg.id, catalog_item_id=cid))

    db.commit()
    db.refresh(pkg)
    return _to_out(pkg)


@router.put("/{package_id}", response_model=TestPackageOut)
def update_package(
    package_id: int,
    payload: TestPackageUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_role(UserRole.admin, UserRole.manager)),
):
    pkg = db.query(TestPackage).filter(TestPackage.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found.")

    if payload.name is not None:
        pkg.name = payload.name
    if payload.description is not None:
        pkg.description = payload.description
    if payload.price is not None:
        pkg.price = payload.price
    if payload.is_active is not None:
        pkg.is_active = payload.is_active

    if payload.catalog_item_ids is not None:
        if not payload.catalog_item_ids:
            raise HTTPException(status_code=400, detail="A package must include at least one test.")
        # Validate
        for cid in payload.catalog_item_ids:
            if not db.query(TestCatalogItem).filter(TestCatalogItem.id == cid).first():
                raise HTTPException(status_code=404, detail=f"Catalog item {cid} not found.")
        # Replace membership
        db.query(TestPackageItem).filter(TestPackageItem.package_id == package_id).delete()
        for cid in payload.catalog_item_ids:
            db.add(TestPackageItem(package_id=package_id, catalog_item_id=cid))

    db.commit()
    db.refresh(pkg)
    return _to_out(pkg)


@router.delete("/{package_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_package(
    package_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_role(UserRole.admin, UserRole.manager)),
):
    pkg = db.query(TestPackage).filter(TestPackage.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found.")
    db.delete(pkg)
    db.commit()
