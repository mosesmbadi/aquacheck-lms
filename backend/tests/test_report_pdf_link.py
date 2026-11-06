"""The temporary link behind "Open in a new tab". It works without a login, so it has to
give exactly the access of whoever requested it, and nothing else."""
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

from app.models.report import ReportStatus
from app.models.user import UserRole
from app.services.auth import create_access_token
from tests.conftest import auth

API = "/api/v1"


def new_link(client, report, user, **params) -> str:
    response = client.post(f"{API}/reports/{report.id}/pdf-link", params=params, headers=auth(user))
    assert response.status_code == 200, response.text
    return response.json()["path"]


def test_link_opens_the_pdf_without_a_login_under_the_sample_code(client, make_user, make_report):
    report = make_report()  # on sample QT/1/2026
    path = new_link(client, report, make_user())

    assert urlparse(path).path == f"/reports/{report.id}/file/QT-1-2026.pdf"
    response = client.get(f"{API}{path}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF-")
    # Inline, so a new tab shows the report rather than downloading it.
    assert response.headers["content-disposition"] == 'inline; filename="QT-1-2026.pdf"'


def test_link_requires_a_login_to_create(client, make_report):
    assert client.post(f"{API}/reports/{make_report().id}/pdf-link").status_code in (401, 403)


def test_link_is_only_valid_for_its_own_report(client, make_user, make_report):
    user = make_user()
    first, second = make_report(), make_report()
    token = parse_qs(urlparse(new_link(client, first, user)).query)["token"][0]

    response = client.get(f"{API}/reports/{second.id}/file/x.pdf", params={"token": token})

    assert response.status_code == 401


def test_tampered_link_is_refused(client, make_user, make_report):
    report = make_report()
    path = new_link(client, report, make_user())
    assert client.get(f"{API}{path}x").status_code == 401


def test_expired_link_is_refused(client, make_user, make_report):
    report, user = make_report(), make_user()
    token = create_access_token({"pdf_report": report.id, "pdf_user": user.id}, timedelta(minutes=-1))
    response = client.get(f"{API}/reports/{report.id}/file/x.pdf", params={"token": token})
    assert response.status_code == 401


def test_login_token_cannot_open_a_link(client, make_user, make_report):
    report, user = make_report(), make_user()
    token = auth(user)["Authorization"].removeprefix("Bearer ")
    response = client.get(f"{API}/reports/{report.id}/file/x.pdf", params={"token": token})
    assert response.status_code == 401


def test_link_token_cannot_be_used_to_log_in(client, make_user, make_report):
    report = make_report()
    token = parse_qs(urlparse(new_link(client, report, make_user())).query)["token"][0]
    response = client.get(f"{API}/reports/{report.id}", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_link_stops_working_when_the_user_is_deactivated(client, db, make_user, make_report):
    report, user = make_report(), make_user()
    path = new_link(client, report, user)

    user.is_active = False
    db.commit()

    assert client.get(f"{API}{path}").status_code == 401


def test_customers_access_is_rechecked_when_the_link_is_opened(client, db, make_user, make_customer, make_report):
    customer = make_customer()
    report = make_report(customer=customer, status=ReportStatus.issued)
    viewer = make_user("Client User", role=UserRole.customer, customer_id=customer.id)
    path = new_link(client, report, viewer)
    assert client.get(f"{API}{path}").status_code == 200

    report.status = ReportStatus.draft
    db.commit()

    assert client.get(f"{API}{path}").status_code == 403


def test_link_keeps_the_picked_signers(client, make_user, make_report):
    from tests.test_report_pdf import pdf_text

    make_user("Default Signer", report_signatory="authorizer")
    picked = make_user("Picked Signer")
    report = make_report()

    path = new_link(client, report, make_user(), signers=str(picked.id))

    text = pdf_text(client.get(f"{API}{path}"))
    assert "PICKED SIGNER" in text
    assert "DEFAULT SIGNER" not in text
