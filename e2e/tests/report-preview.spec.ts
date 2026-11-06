import { expect, test, type Page, type Request } from "@playwright/test";

// Seeded by the backend at startup from e2e/docker-compose.yml.
const ADMIN_EMAIL = "e2e-admin@aquachecklab.com";
const ADMIN_PASSWORD = "e2e-admin-password";
const ADMIN_NAME = "System Administrator";
const API = "/api/v1";

let adminId: number;
let sampleId: number;
let sampleCode: string;
let reportId: number;
let reportNumber: string;
let framingErrors: string[];

const pdfFileName = () => `${reportNumber.replace(/\//g, "_")}.pdf`;

/** An issued report on a completed sample, created through the API as staff would. */
test.beforeAll(async ({ request }) => {
  const login = await request.post(`${API}/auth/login`, { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  expect(login.ok(), await login.text()).toBeTruthy();
  const { access_token, user } = await login.json();
  adminId = user.id;
  const headers = { Authorization: `Bearer ${access_token}` };

  const created = await request.post(`${API}/samples`, {
    headers,
    data: { sample_type: "Treated Potable Water", sample_category: "potable", description: "E2E sample" },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const sample = await created.json();
  sampleId = sample.id;
  sampleCode = sample.sample_code;

  const reports = await request.get(`${API}/reports`, { headers, params: { include_pending: true, sample_id: sampleId } });
  expect(reports.ok(), await reports.text()).toBeTruthy();
  const [report] = await reports.json();
  reportId = report.id;
  reportNumber = report.report_number;

  const completed = await request.put(`${API}/samples/${sampleId}`, { headers, data: { status: "completed" } });
  expect(completed.ok(), await completed.text()).toBeTruthy();
  const issued = await request.post(`${API}/reports/${reportId}/issue`, { headers });
  expect(issued.ok(), await issued.text()).toBeTruthy();
});

test.beforeEach(async ({ page }) => {
  framingErrors = [];
  page.on("console", (message) => {
    if (/refused to (display|frame)|x-frame-options/i.test(message.text())) framingErrors.push(message.text());
  });

  await page.goto("/login");
  await page.getByPlaceholder("you@aquacheck.com").fill(ADMIN_EMAIL);
  await page.getByPlaceholder("••••••••").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard**");
});

test.afterEach(() => {
  expect(framingErrors, "the browser refused to show a page in a frame").toEqual([]);
});

/**
 * The preview must hold the PDF itself. A frame pointed at an API URL shows a broken page
 * in production, where X-Frame-Options: DENY applies, even though every request succeeds.
 */
async function expectPreviewShowsThePdf(page: Page) {
  const frame = page.locator('iframe[title="Test report"]');
  await expect(frame).toHaveAttribute("src", /^blob:/, { timeout: 30_000 });
  const src = (await frame.getAttribute("src"))!;
  const firstBytes = await page.evaluate(async (url) => {
    const response = await fetch(url.split("#")[0]);
    return (await response.blob()).slice(0, 5).text();
  }, src);
  expect(firstBytes).toBe("%PDF-");
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeEnabled();
}

/** Resolves once the modal's Download button delivers the file under the report's name. */
function reportDownload(page: Page) {
  return page.waitForEvent("download", {
    predicate: (download) => download.suggestedFilename() === pdfFileName(),
    timeout: 30_000,
  });
}

test("the test stack sends production's framing header", async ({ request }) => {
  const response = await request.get("/login");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
});

test("Samples page: preview shows the report and Download names the file", async ({ page }) => {
  await page.goto("/dashboard/samples");
  await page.locator("tr", { hasText: sampleCode }).getByTitle("Print Test Report", { exact: true }).click();
  await expectPreviewShowsThePdf(page);

  const download = reportDownload(page);
  await page.getByTitle("Download PDF", { exact: true }).click();
  await download;
});

test("Reports page: preview shows the report and Download names the file", async ({ page }) => {
  await page.goto("/dashboard/reports");
  await page.locator("tr", { hasText: reportNumber }).getByRole("button", { name: "View / Print" }).click();
  await expectPreviewShowsThePdf(page);

  const download = reportDownload(page);
  await page.getByTitle("Download PDF", { exact: true }).click();
  await download;
});

test("Open in a new tab links to the PDF under the report's name, through the WAF", async ({ page, request }) => {
  await page.goto("/dashboard/reports");
  await page.locator("tr", { hasText: reportNumber }).getByRole("button", { name: "View / Print" }).click();

  const link = page.getByTitle("Open in a new tab", { exact: true });
  await expect(link).toHaveAttribute("href", new RegExp(`/reports/${reportId}/file/${pdfFileName()}\\?token=`), {
    timeout: 30_000,
  });

  // `request` carries no login, the same as a browser following the link.
  const response = await request.get((await link.getAttribute("href"))!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect(response.headers()["content-disposition"]).toBe(`inline; filename="${pdfFileName()}"`);
  expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("Signatories picked on the sample page reach the preview and the download", async ({ page }) => {
  const asksForPickedSigner = (request: Request) => {
    const url = new URL(request.url());
    return url.pathname === `${API}/reports/${reportId}/pdf` && url.searchParams.get("signers") === String(adminId);
  };

  await page.goto(`/dashboard/samples/${sampleId}`);
  const signer = page.locator("button", { hasText: ADMIN_NAME }).filter({ hasText: "No sig" });
  await signer.click();
  await expect(signer).toContainText("Selected");

  const preview = page.waitForRequest(asksForPickedSigner);
  await page.getByRole("button", { name: "Print Report" }).click();
  await preview;
  await expectPreviewShowsThePdf(page);

  const downloadRequest = page.waitForRequest(asksForPickedSigner);
  const download = reportDownload(page);
  await page.getByTitle("Download PDF", { exact: true }).click();
  await downloadRequest;
  await download;
});
