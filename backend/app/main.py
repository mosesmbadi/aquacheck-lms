from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError
from sqlalchemy import text

from app.database import engine, Base, SessionLocal
from app.models import *  # noqa: F401,F403 — ensure all models are registered

from app.routers import (
    auth,
    users,
    customers,
    contracts,
    samples,
    test_results,
    equipment,
    reports,
    complaints,
    nonconformities,
    quality,
    test_catalog,
    documents,
    inventory,
    quotations,
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
        "http://localhost:3001", "http://127.0.0.1:3001",
        "http://localhost:3002", "http://127.0.0.1:3002",
        "http://localhost:3030", "http://127.0.0.1:3030",
        "http://35.154.192.45:3002", "http://35.154.192.45:3030",
        "http://192.168.100.46:3000", "http://192.168.100.46:3001",
        "http://192.168.100.46:3002", "http://192.168.100.46:3030",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"

for router_module in [
    auth, users, customers, contracts, samples,
    test_results, equipment, reports, complaints, nonconformities, quality,
    test_catalog, documents, inventory, quotations,
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


def ensure_schema_compatibility():
    with engine.begin() as connection:
        # samples.contract_id — allow standalone samples
        is_nullable = connection.execute(
            text(
                """
                SELECT is_nullable
                FROM information_schema.columns
                WHERE table_name = 'samples' AND column_name = 'contract_id'
                """
            )
        ).scalar()
        if is_nullable == "NO":
            connection.execute(text("ALTER TABLE samples ALTER COLUMN contract_id DROP NOT NULL"))
            print("[LIMS] Updated samples.contract_id to allow standalone samples.")

        # test_results.method_id — allow catalog-based results without a method FK
        method_nullable = connection.execute(
            text(
                """
                SELECT is_nullable
                FROM information_schema.columns
                WHERE table_name = 'test_results' AND column_name = 'method_id'
                """
            )
        ).scalar()
        if method_nullable == "NO":
            connection.execute(text("ALTER TABLE test_results ALTER COLUMN method_id DROP NOT NULL"))
            print("[LIMS] Updated test_results.method_id to allow catalog-only results.")

        # test_results.catalog_item_id — add if not present
        col_exists = connection.execute(
            text(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'test_results' AND column_name = 'catalog_item_id'
                """
            )
        ).scalar()
        if not col_exists:
            connection.execute(text(
                "ALTER TABLE test_results ADD COLUMN catalog_item_id INTEGER REFERENCES test_catalog(id)"
            ))
            print("[LIMS] Added test_results.catalog_item_id column.")

        # samples.requested_test_ids — add JSONB column if not present
        rti_exists = connection.execute(
            text(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'samples' AND column_name = 'requested_test_ids'
                """
            )
        ).scalar()
        if not rti_exists:
            connection.execute(text(
                "ALTER TABLE samples ADD COLUMN requested_test_ids JSONB DEFAULT '[]'::jsonb"
            ))
            print("[LIMS] Added samples.requested_test_ids column.")

        # customers.currency — add if not present
        currency_exists = connection.execute(
            text(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'customers' AND column_name = 'currency'
                """
            )
        ).scalar()
        if not currency_exists:
            connection.execute(text(
                "ALTER TABLE customers ADD COLUMN currency VARCHAR DEFAULT 'KES'"
            ))
            print("[LIMS] Added customers.currency column.")

        # documents.content — add JSON column if not present
        content_exists = connection.execute(
            text(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'documents' AND column_name = 'content'
                """
            )
        ).scalar()
        if not content_exists:
            connection.execute(text(
                "ALTER TABLE documents ADD COLUMN content JSON NOT NULL DEFAULT '[]'::json"
            ))
            print("[LIMS] Added documents.content column.")

        # users.customer_id — link customer-role users to a customer
        user_cust_exists = connection.execute(
            text(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'customer_id'
                """
            )
        ).scalar()
        if not user_cust_exists:
            connection.execute(text(
                "ALTER TABLE users ADD COLUMN customer_id INTEGER REFERENCES customers(id)"
            ))
            print("[LIMS] Added users.customer_id column.")

        # users.is_contact_person — flag whether this user is the contact person for the customer
        user_contact_exists = connection.execute(
            text(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'is_contact_person'
                """
            )
        ).scalar()
        if not user_contact_exists:
            connection.execute(text(
                "ALTER TABLE users ADD COLUMN is_contact_person BOOLEAN NOT NULL DEFAULT FALSE"
            ))
            print("[LIMS] Added users.is_contact_person column.")

        # test_catalog.price — add if not present
        price_exists = connection.execute(
            text(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'test_catalog' AND column_name = 'price'
                """
            )
        ).scalar()
        if not price_exists:
            connection.execute(text(
                "ALTER TABLE test_catalog ADD COLUMN price NUMERIC(12,2) NOT NULL DEFAULT 0"
            ))
            print("[LIMS] Added test_catalog.price column.")

        # samples.customer_id — associate sample directly with a customer
        sample_cust_exists = connection.execute(
            text(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'samples' AND column_name = 'customer_id'
                """
            )
        ).scalar()
        if not sample_cust_exists:
            connection.execute(text(
                "ALTER TABLE samples ADD COLUMN customer_id INTEGER REFERENCES customers(id)"
            ))
            print("[LIMS] Added samples.customer_id column.")


@app.on_event("startup")
def on_startup():
    try:
        Base.metadata.create_all(bind=engine)
        ensure_schema_compatibility()
        print("[LIMS] Database tables ensured.")
    except OperationalError as e:
        print(f"[LIMS] WARNING: Could not create tables: {e}")
        return

    db = SessionLocal()
    try:
        seed_admin(db)
        from app.routers.test_catalog import seed_catalog
        added = seed_catalog(db)
        if added:
            print(f"[LIMS] Seeded {added} dialysis water test catalog items.")
        else:
            print("[LIMS] Test catalog already up to date.")

        from app.services.seed_customers import seed_customers
        cust_added = seed_customers(db)
        if cust_added:
            print(f"[LIMS] Seeded {cust_added} customers from customer list.")
        else:
            print("[LIMS] Customers already up to date.")

        from app.routers.documents import seed_documents
        docs_added = seed_documents(db)
        if docs_added:
            print(f"[LIMS] Seeded {docs_added} SOPs/Master List documents.")
        else:
            print("[LIMS] Documents already up to date.")
    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "ok", "service": "AquaCheck LIMS Backend"}
