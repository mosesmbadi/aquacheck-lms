from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError

from app.database import engine, Base, SessionLocal
from app.models import *  # noqa: F401,F403 — ensure all models are registered

from app.routers import (
    auth,
    users,
    customers,
    contracts,
    methods,
    samples,
    test_results,
    equipment,
    reports,
    complaints,
    nonconformities,
    quality,
)

app = FastAPI(
    title="AquaCheck LIMS API",
    description="Laboratory Information Management System for Aquacheck Laboratories Ltd. — ISO/IEC 17025 compliant.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", "http://127.0.0.1:3000", "http://frontend:3000",
        "http://localhost:3030", "http://127.0.0.1:3030",
        "http://35.154.192.45:3030",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"

for router_module in [
    auth, users, customers, contracts, methods, samples,
    test_results, equipment, reports, complaints, nonconformities, quality,
]:
    app.include_router(router_module.router, prefix=API_PREFIX)


def seed_admin(db):
    from app.models.user import User, UserRole
    from app.services.auth import get_password_hash

    existing = db.query(User).filter(User.email == "admin@aquacheck.com").first()
    if not existing:
        admin = User(
            email="admin@aquacheck.com",
            full_name="System Administrator",
            hashed_password=get_password_hash("Admin@123"),
            role=UserRole.admin,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        print("[LIMS] Default admin user created: admin@aquacheck.com / Admin@123")
    else:
        print("[LIMS] Admin user already exists.")


@app.on_event("startup")
def on_startup():
    try:
        Base.metadata.create_all(bind=engine)
        print("[LIMS] Database tables ensured.")
    except OperationalError as e:
        print(f"[LIMS] WARNING: Could not create tables: {e}")
        return

    db = SessionLocal()
    try:
        seed_admin(db)
    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "ok", "service": "AquaCheck LIMS Backend"}
