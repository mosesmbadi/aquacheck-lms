"""The test report PDF: what it contains, who signs it and who may see it."""
import io

from pypdf import PdfReader

from app.models.report import ReportStatus
from app.models.sample import SampleStatus
from app.models.test_catalog import TestCatalogItem as CatalogItem, TestCategory as CatalogCategory
from app.models.user import UserRole
from tests.conftest import auth

API = "/api/v1"


def pdf_reader(response) -> PdfReader:
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF-")
    return PdfReader(io.BytesIO(response.content))


def pdf_text(response) -> str:
    text = " ".join(page.extract_text() for page in pdf_reader(response).pages)
    return " ".join(text.split())


# ── The document ──────────────────────────────────────────────────────────────


def test_download_is_named_after_the_sample_code(client, make_user, make_report):
    report = make_report()  # on sample QT/1/2026
    response = client.get(f"{API}/reports/{report.id}/pdf", headers=auth(make_user()))
    pdf_reader(response)
    assert response.headers["content-disposition"] == 'attachment; filename="QT-1-2026.pdf"'


def test_inline_opens_in_the_browser_instead_of_downloading(client, make_user, make_report):
    report = make_report()
    response = client.get(f"{API}/reports/{report.id}/pdf", params={"inline": True}, headers=auth(make_user()))
    assert response.headers["content-disposition"] == 'inline; filename="QT-1-2026.pdf"'


def test_pdf_title_is_the_file_name(client, make_user, make_report):
    """Browsers offer the PDF's title as the file name when saving from the print dialog."""
    report = make_report()
    response = client.get(f"{API}/reports/{report.id}/pdf", headers=auth(make_user()))
    assert pdf_reader(response).metadata.title == "QT-1-2026"


def test_link_uses_the_same_file_name_as_the_download(client, make_user, make_report):
    report = make_report()
    path = client.post(f"{API}/reports/{report.id}/pdf-link", headers=auth(make_user())).json()["path"]
    assert f"/reports/{report.id}/file/QT-1-2026.pdf?" in path
    assert client.get(f"{API}{path}").status_code == 200


def test_report_without_a_sample_is_named_after_its_report_number(client, db, make_user, make_report):
    report = make_report(report_number="RPT/2026/7")
    report.content = {}
    db.commit()

    path = client.post(f"{API}/reports/{report.id}/pdf-link", headers=auth(make_user())).json()["path"]

    assert f"/reports/{report.id}/file/RPT-2026-7.pdf?" in path


def test_requested_test_without_a_result_is_reported_as_not_tested(client, db, make_user, make_report):
    """ISO/IEC 17025 §7.8.2: a missing result must never read as a pass."""
    item = CatalogItem(name="Turbidity", category=CatalogCategory.physicochemical, standard_limit="5")
    db.add(item)
    db.commit()
    report = make_report(requested_test_ids=[item.id])

    text = pdf_text(client.get(f"{API}/reports/{report.id}/pdf", headers=auth(make_user())))

    assert "Turbidity" in text
    assert "not tested" in text
    assert "All tested parameters comply" not in text


def test_missing_report_is_404(client, make_user):
    assert client.get(f"{API}/reports/999/pdf", headers=auth(make_user())).status_code == 404


# ── Signers ───────────────────────────────────────────────────────────────────


def test_report_signatories_sign_by_default(client, make_user, make_report):
    make_user("Default Signer", report_signatory="authorizer")
    report = make_report()

    text = pdf_text(client.get(f"{API}/reports/{report.id}/pdf", headers=auth(make_user())))

    assert "DEFAULT SIGNER" in text


def test_staff_can_pick_who_signs(client, make_user, make_report):
    """The modal's preview and its Download button both rely on this parameter."""
    make_user("Default Signer", report_signatory="authorizer")
    picked = make_user("Picked Signer")
    report = make_report()

    response = client.get(
        f"{API}/reports/{report.id}/pdf", params={"signers": str(picked.id)}, headers=auth(make_user())
    )

    text = pdf_text(response)
    assert "PICKED SIGNER" in text
    assert "DEFAULT SIGNER" not in text


def test_customer_cannot_change_who_signs(client, make_user, make_customer, make_report):
    make_user("Default Signer", report_signatory="authorizer")
    picked = make_user("Picked Signer")
    customer = make_customer()
    report = make_report(customer=customer, status=ReportStatus.issued)
    viewer = make_user("Client User", role=UserRole.customer, customer_id=customer.id)

    response = client.get(f"{API}/reports/{report.id}/pdf", params={"signers": str(picked.id)}, headers=auth(viewer))

    text = pdf_text(response)
    assert "DEFAULT SIGNER" in text
    assert "PICKED SIGNER" not in text


def test_issuing_freezes_the_signatories(client, db, make_user, make_report):
    signer = make_user("Original Signer", report_signatory="authorizer")
    issuer = make_user("Issuer")
    report = make_report()
    assert client.post(f"{API}/reports/{report.id}/issue", headers=auth(issuer)).status_code == 200

    signer.report_signatory = None
    make_user("Replacement Signer", report_signatory="authorizer")
    db.commit()

    text = pdf_text(client.get(f"{API}/reports/{report.id}/pdf", headers=auth(issuer)))
    assert "ORIGINAL SIGNER" in text
    assert "REPLACEMENT SIGNER" not in text


def test_report_cannot_be_issued_before_results_are_final(client, make_user, make_report):
    report = make_report(sample_status=SampleStatus.in_testing)
    assert client.post(f"{API}/reports/{report.id}/issue", headers=auth(make_user())).status_code == 400


# ── Who can see a report ──────────────────────────────────────────────────────


def test_pdf_requires_login(client, make_report):
    assert client.get(f"{API}/reports/{make_report().id}/pdf").status_code in (401, 403)


def test_customer_can_view_their_own_issued_report(client, make_user, make_customer, make_report):
    customer = make_customer()
    report = make_report(customer=customer, status=ReportStatus.issued)
    viewer = make_user("Client User", role=UserRole.customer, customer_id=customer.id)
    pdf_reader(client.get(f"{API}/reports/{report.id}/pdf", headers=auth(viewer)))


def test_customer_cannot_view_their_own_draft(client, make_user, make_customer, make_report):
    customer = make_customer()
    report = make_report(customer=customer, status=ReportStatus.draft)
    viewer = make_user("Client User", role=UserRole.customer, customer_id=customer.id)
    assert client.get(f"{API}/reports/{report.id}/pdf", headers=auth(viewer)).status_code == 403


def test_customer_cannot_view_another_customers_report(client, make_user, make_customer, make_report):
    report = make_report(customer=make_customer("Other Client"), status=ReportStatus.issued)
    viewer = make_user("Client User", role=UserRole.customer, customer_id=make_customer("Own Client").id)
    headers = auth(viewer)

    assert client.get(f"{API}/reports/{report.id}/pdf", headers=headers).status_code == 403
    assert client.post(f"{API}/reports/{report.id}/pdf-link", headers=headers).status_code == 403
