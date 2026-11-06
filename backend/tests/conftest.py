"""Shared test setup. The tests run against a real PostgreSQL database, because the report
queries use its JSON operators, and every table in that database is dropped and recreated.

The settings below must be in place before anything imports `app`, which reads them once.
"""
import os

from sqlalchemy.engine import make_url

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://lims_user:lims_pass@localhost:55432/lims_test"
)
# These tests wipe the database. Never let them near one that isn't explicitly for tests,
# whatever the environment or a .env file says.
if not (make_url(TEST_DATABASE_URL).database or "").endswith("_test"):
    raise RuntimeError("TEST_DATABASE_URL must name a database ending in _test: these tests wipe it.")

os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["ADMIN_EMAIL"] = "admin@aquachecklab.com"
os.environ["ADMIN_PASSWORD"] = "not-used-by-these-tests"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models.customer import Customer  # noqa: E402
from app.models.report import Report, ReportStatus, ReportType  # noqa: E402
from app.models.sample import Sample, SampleCategory, SampleStatus  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402
from app.services.auth import create_access_token  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def schema():
    assert engine.url.database.endswith("_test")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def clean_tables(schema):
    tables = ", ".join(f'"{table.name}"' for table in Base.metadata.sorted_tables)
    with engine.begin() as connection:
        connection.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture
def db(clean_tables):
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def client():
    # Not used as a context manager, so the app's startup seeding doesn't run.
    return TestClient(app)


def auth(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


@pytest.fixture
def make_user(db):
    def _make(full_name="Staff Member", role=UserRole.technician, **fields):
        user = User(
            email=f"{full_name.lower().replace(' ', '.')}@aquachecklab.com",
            full_name=full_name,
            role=role,
            hashed_password="not-used-by-these-tests",
            **fields,
        )
        db.add(user)
        db.commit()
        return user

    return _make


@pytest.fixture
def make_customer(db):
    def _make(name="Client Ltd"):
        customer = Customer(name=name)
        db.add(customer)
        db.commit()
        return customer

    return _make


@pytest.fixture
def make_report(db):
    """A report on its own sample. It defaults to a completed sample and a draft report."""
    counter = iter(range(1, 1000))

    def _make(
        customer=None,
        status=ReportStatus.draft,
        sample_status=SampleStatus.completed,
        report_number=None,
        requested_test_ids=None,
    ):
        n = next(counter)
        customer_id = customer.id if customer else None
        sample = Sample(
            sample_code=f"QT/{n}/2026",
            customer_id=customer_id,
            sample_type="Treated Potable Water",
            sample_category=SampleCategory.potable,
            status=sample_status,
            requested_test_ids=requested_test_ids or [],
        )
        db.add(sample)
        db.flush()
        report = Report(
            report_number=report_number or f"RPT-2026-{n:05d}",
            customer_id=customer_id,
            report_type=ReportType.test_report,
            status=status,
            content={"sample_id": sample.id},
        )
        db.add(report)
        db.commit()
        return report

    return _make
