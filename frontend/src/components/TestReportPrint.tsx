"use client";

import { useRef, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Printer, X, Clock } from "lucide-react";
import { samplesApi, testResultsApi, testCatalogApi, contractsApi, customersApi, reportsApi, resultQualifiersApi } from "@/lib/api";
import type { Sample, TestResult, TestCatalogItem, Contract, Customer, Report, User, ResultQualifier } from "@/lib/types";
import { evaluateRemark, legendEntries } from "@/lib/compliance";

interface TestReportPrintProps {
  sampleId: number;
  reportId?: number;
  onClose: () => void;
  signatories?: User[];
}

export default function TestReportPrint({ sampleId, reportId, onClose, signatories = [] }: TestReportPrintProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [printing, setPrinting] = useState(false);

  const { data: sample } = useQuery<Sample>({
    queryKey: ["sample", sampleId],
    queryFn: () => samplesApi.get(sampleId).then((r) => r.data),
  });

  const { data: testResults = [] } = useQuery<TestResult[]>({
    queryKey: ["test-results", { sample_id: sampleId }],
    queryFn: () => testResultsApi.list({ sample_id: sampleId }).then((r) => r.data),
  });

  const { data: catalogItems = [] } = useQuery<TestCatalogItem[]>({
    queryKey: ["test-catalog"],
    queryFn: () => testCatalogApi.list({ active_only: true }).then((r) => r.data),
  });

  const { data: qualifiers = [] } = useQuery<ResultQualifier[]>({
    queryKey: ["result-qualifiers"],
    queryFn: () => resultQualifiersApi.list({ active_only: true }).then((r) => r.data),
  });

  const { data: contract } = useQuery<Contract>({
    queryKey: ["contract", sample?.contract_id],
    queryFn: () => contractsApi.get(sample!.contract_id!).then((r) => r.data),
    enabled: !!sample?.contract_id,
  });

  // A sample may be linked to a client directly (standalone sample) or through its
  // contract. The direct link wins — it is the more specific of the two.
  const customerId = sample?.customer_id ?? contract?.customer_id;

  const { data: customer } = useQuery<Customer>({
    queryKey: ["customer", customerId],
    queryFn: () => customersApi.get(customerId!).then((r) => r.data),
    enabled: !!customerId,
  });

  const { data: allReports = [] } = useQuery<Report[]>({
    queryKey: ["reports"],
    queryFn: () => reportsApi.list().then((r) => r.data),
  });

  const report = reportId
    ? allReports.find((r) => r.id === reportId)
    : allReports.find((r) => r.content?.sample_id === sampleId);
  const qc = useQueryClient();

  const createReport = useMutation<Report, unknown, void>({
    mutationFn: () =>
      reportsApi.create({
        contract_id: sample?.contract_id,
        report_type: "test_report",
        content: { sample_id: sampleId },
      }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });

  useEffect(() => {
    if (!reportId && sample && !report && !createReport.isPending) {
      createReport.mutate();
    }
  }, [reportId, sample?.id, report?.id]);

  const rc = report?.content || {};

  const resultByCatalog: Record<number, TestResult> = {};
  for (const tr of testResults) {
    if (tr.catalog_item_id) resultByCatalog[tr.catalog_item_id] = tr;
  }

  const requestedIds = new Set(sample?.requested_test_ids ?? []);
  const requestedItems =
    requestedIds.size > 0 ? catalogItems.filter((c) => requestedIds.has(c.id)) : catalogItems;

  const physicochemical = requestedItems.filter((c) => c.category === "physicochemical");
  const microbiological = requestedItems.filter((c) => c.category === "microbiological");

  // A parameter with no result is reported as untested. It is never defaulted to a
  // value and never counts towards a conformity statement — reporting a result the lab
  // did not measure is falsification (ISO/IEC 17025 §7.8.2).
  const rows = requestedItems.map((item) => {
    const value = resultByCatalog[item.id]?.result_value?.trim() ?? "";
    return { item, value, remark: evaluateRemark(item.standard_limit, value, qualifiers) };
  });
  const rowsByItemId = new Map(rows.map((r) => [r.item.id, r]));

  const nonCompliantItems = rows.filter((r) => r.remark.kind === "non_compliant").map((r) => r.item);
  const hasNonCompliant = nonCompliantItems.length > 0;
  const untestedItems = rows.filter((r) => r.remark.kind === "not_tested").map((r) => r.item);
  const evaluatedCount = rows.filter(
    (r) => r.remark.kind === "compliant" || r.remark.kind === "non_compliant"
  ).length;

  const handlePrint = () => {
    setPrinting(true);
    setTimeout(() => {
      const content = printRef.current;
      if (!content) return;
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(`
        <html>
        <head>
          <base href="${window.location.origin}/" />
          <title>Test Report - ${sample?.sample_code || ""}</title>
          <style>
            @page {
              size: A4;
              margin: 15mm 15mm 20mm 15mm;
              @bottom-center {
                content: "Page " counter(page) " of " counter(pages);
                font-size: 8px;
                color: #666;
              }
            }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Times New Roman', Times, serif; font-size: 11px; color: #000; }
            table { page-break-inside: auto; }
            thead { display: table-header-group; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            .report { max-width: 700px; margin: 0 auto; }
            img { max-width: 100%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          </style>
        </head>
        <body>${content.innerHTML}</body>
        </html>
      `);
      win.document.close();
      win.focus();
      win.print();
      win.close();
      setPrinting(false);
    }, 300);
  };

  if (!sample) return null;

  const samplingDate = sample.collection_date ? format(new Date(sample.collection_date), "dd/MM/yyyy") : "—";
  const receivedDate = format(new Date(sample.received_at), "dd/MM/yyyy");
  const analysisDate = rc.analysis_date
    ? format(new Date(rc.analysis_date), "dd/MM/yyyy")
    : receivedDate;
  const reportIssuedDate = report?.issued_at
    ? format(new Date(report.issued_at), "dd/MM/yyyy")
    : format(new Date(), "dd/MM/yyyy");

  const isWaste = sample.sample_category === "waste";
  const isPackaged = sample.sample_category === "packaged_drinking_water";

  const SCHEDULE_SPEC_HEADERS: Record<number, string> = {
    3: "NEMA STANDARD FOR EFFLUENT WATER;\nTHIRD SCHEDULE.\nMaximum levels Permissible.",
    4: "NEMA MONITORING GUIDE;\nFOURTH SCHEDULE.",
    5: "NEMA STANDARD FOR EFFLUENT WATER;\nFIFTH SCHEDULE.\nMaximum levels Permissible.",
    6: "NEMA MONITORING STANDARD;\nSIXTH SCHEDULE.",
  };

  const SCHEDULE_CONTEXT: Record<number, string> = {
    3: "discharge into the environment based on the legal notice No.120 of EMCA, 2006",
    5: "discharge into public sewers based on the legal notice No.120 of EMCA, 2006",
    6: "discharge of treated effluent into the environment based on the legal notice No.120 of EMCA, 2006",
  };

  let specHeader: string;
  let scheduleContext: string;
  if (isWaste && sample.waste_schedule) {
    specHeader = SCHEDULE_SPEC_HEADERS[sample.waste_schedule] ?? "NEMA STANDARD";
    scheduleContext = SCHEDULE_CONTEXT[sample.waste_schedule] ?? "the applicable NEMA standard";
  } else if (isPackaged) {
    specHeader = "KS EAS 12:2018\nPackaged Drinking Water Limit";
    scheduleContext = "KS EAS 12:2018 specifications for packaged drinking water";
  } else {
    specHeader = rc.specification_title || "KS EAS 12:2018\nTreated Potable Water Limit";
    scheduleContext = "KS EAS 12:2018 specifications for treated potable water";
  }

  const sampledBy: string = rc.sampled_by || sample.sampled_by_name || "AQUACHECK LABORATORIES LTD";
  const contactPerson: string =
    rc.client_contact ||
    sample.contact_person ||
    (customer?.contact_person
      ? `${customer.contact_person}${customer.phone ? ` - ${customer.phone}` : ""}`
      : "") ||
    "—";
  // The client is the party the report is issued to, so a linked one takes precedence.
  // Without a client (walk-in or ad-hoc sample) the contact person stands in.
  const submittedBy: string =
    rc.submitted_by || customer?.name || sample.submitted_by || contactPerson;
  const sampleLabId: string = rc.sample_lab_id || sample.physical_sample_id || sample.sample_code;
  const authorizerName: string = rc.authorizer_name || "Victor Mutai";
  const authorizerTitle: string = rc.authorizer_title || "Water Chemist";
  const analystName: string = rc.analyst_name || "";
  const analystTitle: string = rc.analyst_title || "Lab Analyst";
  const reportTitle: string = rc.report_title || "TEST REPORT";
  const finalComment: string = rc.final_comment || "";
  const disclaimer: string = rc.disclaimer || "";
  const sampleNotes: string = (sample as Sample & { notes?: string }).notes || "";

  // QR code URL for public report
  const appBase = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");
  const publicReportUrl = report?.public_token ? `${appBase}/public/reports/${report.public_token}` : null;
  const qrApiUrl = publicReportUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(publicReportUrl)}`
    : null;

  const revisionHistory = report?.revision_history ?? [];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto py-8">
      <div className="bg-white rounded-lg shadow-xl max-w-[800px] w-full mx-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b bg-gray-50 rounded-t-lg sticky top-0 z-10">
          <h3 className="font-semibold text-gray-800">Test Report Preview</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={printing}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
            <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-200">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Report content */}
        <div className="p-8" ref={printRef}>
          <div className="report" style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: "11px", color: "#000" }}>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
              <div style={{ flex: 1 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/Images/aquacheck_logo_report.png" alt="AquaCheck Logo" style={{ height: "60px", objectFit: "contain", display: "block" }} />
              </div>
              <div style={{ textAlign: "right", fontSize: "9px", lineHeight: "1.5", color: "#333" }}>
                <div style={{ fontWeight: "bold" }}>AQUACHECK LABORATORIES LIMITED</div>
                <div>P.O. Box 216 – 00300, NAIROBI</div>
                <div>Westlands Commercial Centre</div>
                <div>Off Ring Road, Parklands Rd</div>
                <div>Email: aquachecklab@gmail.com</div>
                <div>Website: www.aquachecklab.com</div>
                <div>TEL: 0755596064/0734933839</div>
              </div>
            </div>

            <hr style={{ border: "none", borderTop: "2px solid #000", margin: "5px 0" }} />

            {/* Report number if available */}
            {report && (
              <div style={{ textAlign: "right", fontSize: "9px", color: "#555", marginBottom: "4px" }}>
                Report No: <strong>{report.report_number}</strong>
                {report.status === "amended" && <span style={{ color: "#b45309", marginLeft: "6px" }}> [AMENDED]</span>}
              </div>
            )}

            {/* Title */}
            <div style={{ textAlign: "center", fontSize: "16px", fontWeight: "bold", textDecoration: "underline", margin: "12px 0" }}>
              {reportTitle}
            </div>

            {/* Meta info */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "10px", fontSize: "11px" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "2px 4px" }}><strong>SAMPLE DESCRIPTION:</strong></td>
                  <td style={{ padding: "2px 4px", textTransform: "uppercase" }} colSpan={2}>{sample.description || sample.sample_type || "WATER SAMPLE"}</td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}><strong>SAMPLING DATE:</strong></td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}>{samplingDate}</td>
                </tr>
                <tr>
                  <td style={{ padding: "2px 4px" }}><strong>SUBMITTED BY/CLIENT:</strong></td>
                  <td style={{ padding: "2px 4px", textTransform: "uppercase" }} colSpan={2}>{submittedBy}</td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}><strong>RECEIVED ON:</strong></td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}>{receivedDate}</td>
                </tr>
                <tr>
                  <td style={{ padding: "2px 4px" }}><strong>CONTACT PERSON:</strong></td>
                  <td style={{ padding: "2px 4px", textTransform: "uppercase" }} colSpan={2}>{contactPerson}</td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}><strong>ANALYSIS DATE:</strong></td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}>{analysisDate}</td>
                </tr>
                <tr>
                  <td style={{ padding: "2px 4px" }}><strong>SAMPLED BY:</strong></td>
                  <td style={{ padding: "2px 4px", textTransform: "uppercase" }} colSpan={2}>{sampledBy}</td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}><strong>REPORT ISSUED ON:</strong></td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}>{reportIssuedDate}</td>
                </tr>
                <tr>
                  <td style={{ padding: "2px 4px" }}><strong>SAMPLING LOCATION:</strong></td>
                  <td style={{ padding: "2px 4px", textTransform: "uppercase" }} colSpan={2}>{sample.collection_location || "—"}</td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}><strong>SAMPLE LAB ID:</strong></td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}>{sampleLabId}</td>
                </tr>
                {sampleNotes && (
                  <tr>
                    <td style={{ padding: "2px 4px" }}><strong>NOTES:</strong></td>
                    <td style={{ padding: "2px 4px" }} colSpan={4}>{sampleNotes}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Results table */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "8px", fontSize: "10px" }}>
              <thead>
                <tr style={{ background: "#e0e0e0" }}>
                  <th style={{ border: "1px solid #000", padding: "3px 5px", textAlign: "left" }}>TEST</th>
                  <th style={{ border: "1px solid #000", padding: "3px 5px", textAlign: "left" }}>METHOD</th>
                  <th style={{ border: "1px solid #000", padding: "3px 5px", textAlign: "center" }}>RESULTS</th>
                  <th style={{ border: "1px solid #000", padding: "3px 5px", textAlign: "center" }}>
                    {specHeader.split("\n").map((line, i) => (
                      <span key={i}>{line}{i < specHeader.split("\n").length - 1 && <br />}</span>
                    ))}
                  </th>
                  <th style={{ border: "1px solid #000", padding: "3px 5px", textAlign: "center" }}>REMARKS</th>
                </tr>
              </thead>
              <tbody>
                {!isWaste && physicochemical.length > 0 && (
                  <tr style={{ pageBreakAfter: "avoid", breakAfter: "avoid" }}>
                    <td colSpan={5} style={{ background: "#333", color: "#fff", border: "1px solid #000", padding: "4px 5px", fontWeight: "bold", textTransform: "uppercase" }}>
                      Physio-Chemical Test
                    </td>
                  </tr>
                )}
                {physicochemical.map((item) => {
                  // Always present: `rows` is built from the same requestedItems list.
                  const row = rowsByItemId.get(item.id)!;
                  const remark = row.remark;
                  const isFail = remark.kind === "non_compliant";
                  return (
                    <tr key={item.id}>
                      <td style={{ border: "1px solid #000", padding: "2px 5px" }}>{item.name}</td>
                      <td style={{ border: "1px solid #000", padding: "2px 5px" }}>{item.method_name || "—"}</td>
                      <td style={{ border: "1px solid #000", padding: "2px 5px", textAlign: "center" }}>{row.value || "—"}</td>
                      <td style={{ border: "1px solid #000", padding: "2px 5px", textAlign: "center" }}>{item.standard_limit || "NS"}</td>
                      <td style={{ border: "1px solid #000", padding: "2px 5px", textAlign: "center",
                          color: isFail ? "#c00" : remark.kind === "compliant" ? "#006600" : undefined,
                          fontWeight: isFail ? "bold" : "normal",
                          fontStyle: remark.kind === "not_tested" ? "italic" : "normal" }}>
                        {remark.label}
                      </td>
                    </tr>
                  );
                })}
                {!isWaste && microbiological.length > 0 && (
                  <tr style={{ pageBreakAfter: "avoid", breakAfter: "avoid" }}>
                    <td colSpan={5} style={{ background: "#333", color: "#fff", border: "1px solid #000", padding: "4px 5px", fontWeight: "bold", textTransform: "uppercase" }}>
                      Microbiological Test
                    </td>
                  </tr>
                )}
                {microbiological.map((item) => {
                  // Always present: `rows` is built from the same requestedItems list.
                  const row = rowsByItemId.get(item.id)!;
                  const remark = row.remark;
                  const isFail = remark.kind === "non_compliant";
                  return (
                    <tr key={item.id}>
                      <td style={{ border: "1px solid #000", padding: "2px 5px" }}>{item.name}</td>
                      <td style={{ border: "1px solid #000", padding: "2px 5px" }}>{item.method_name || "—"}</td>
                      <td style={{ border: "1px solid #000", padding: "2px 5px", textAlign: "center" }}>{row.value || "—"}</td>
                      <td style={{ border: "1px solid #000", padding: "2px 5px", textAlign: "center" }}>{item.standard_limit || "NS"}</td>
                      <td style={{ border: "1px solid #000", padding: "2px 5px", textAlign: "center",
                          color: isFail ? "#c00" : remark.kind === "compliant" ? "#006600" : undefined,
                          fontWeight: isFail ? "bold" : "normal",
                          fontStyle: remark.kind === "not_tested" ? "italic" : "normal" }}>
                        {remark.label}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Legend */}
            <div style={{ fontSize: "9px", margin: "8px 0", lineHeight: "1.5" }}>
              <p>
                {legendEntries(qualifiers, isWaste).map((q, i, all) => (
                  <span key={q.id}>
                    <strong>{q.code}:</strong> {q.label}{i < all.length - 1 ? ", " : "."}
                  </span>
                ))}
              </p>
            </div>

            {/* Disclaimer */}
            <div style={{ fontSize: "9px", margin: "8px 0", lineHeight: "1.4" }}>
              <p><strong style={{ textDecoration: "underline" }}>DISCLAIMER</strong></p>
              <p>{disclaimer || "These results only apply to the sample submitted and the recommendations/comments are only based on the tested parameters. The laboratory will not be held responsible for any sampling errors, which may include improper collection techniques, contamination during the sampling process, or inadequate sample representation."}</p>
              <p>The test report shall not be reproduced without the written approval of Aquacheck Laboratories Ltd.</p>
            </div>

            {/* Comments */}
            {(hasNonCompliant || evaluatedCount > 0 || untestedItems.length > 0 || finalComment) && (
              <div style={{ fontSize: "10px", margin: "8px 0", lineHeight: "1.4" }}>
                <p><strong style={{ textDecoration: "underline" }}>COMMENTS.</strong></p>
                {finalComment
                  ? <p>{finalComment}</p>
                  : hasNonCompliant
                    ? isWaste
                      ? <p>The parameters; {nonCompliantItems.map((i) => i.name).join(", ")} do not meet the set specifications for {scheduleContext}. Treatment is therefore recommended.</p>
                      : <p>The sample does not comply with {scheduleContext}. The {nonCompliantItems.map((i) => i.name).join(", ")} exceeded the set limit. Further treatment is therefore recommended.</p>
                    : evaluatedCount > 0
                      ? <p>All tested parameters comply with {scheduleContext}.</p>
                      : null
                }
                {/* The conformity statement above covers only parameters actually
                    measured, so any gap is stated rather than left to inference. */}
                {untestedItems.length > 0 && (
                  <p>The following requested {untestedItems.length === 1 ? "parameter was" : "parameters were"} not tested and {untestedItems.length === 1 ? "is" : "are"} excluded from the statement above: {untestedItems.map((i) => i.name).join(", ")}.</p>
                )}
              </div>
            )}

            {/* Signatures */}
            <div style={{ display: "flex", justifyContent: signatories.length > 0 ? "space-around" : "space-between", marginTop: "40px", fontSize: "11px", flexWrap: "wrap", gap: "16px", pageBreakInside: "avoid", breakInside: "avoid" }}>
              {signatories.length > 0 ? signatories.map((sig) => (
                <div key={sig.id} style={{ textAlign: "center" }}>
                  {sig.signature_b64 && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`data:image/png;base64,${sig.signature_b64}`}
                      alt="signature"
                      style={{ width: "100px", height: "60px", objectFit: "contain", display: "block", margin: "0 auto 4px" }}
                    />
                  )}
                  <div style={{ borderTop: "1px solid #000", width: "180px", paddingTop: "4px" }}>
                    <div style={{ fontWeight: "bold", textTransform: "uppercase" }}>{sig.full_name}</div>
                    <div style={{ fontStyle: "italic" }}>{sig.job_title || sig.role.replace("_", " ")}</div>
                  </div>
                </div>
              )) : (
                <>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ borderTop: "1px solid #000", width: "180px", paddingTop: "4px" }}>
                      <div style={{ fontWeight: "bold", textTransform: "uppercase" }}>{authorizerName || "___________________"}</div>
                      <div style={{ fontStyle: "italic" }}>{authorizerTitle || "Authorised Signatory"}</div>
                    </div>
                  </div>
                  {analystName && (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ borderTop: "1px solid #000", width: "180px", paddingTop: "4px" }}>
                        <div style={{ fontWeight: "bold", textTransform: "uppercase" }}>{analystName}</div>
                        <div style={{ fontStyle: "italic" }}>{analystTitle}</div>
                      </div>
                    </div>
                  )}
                  {!analystName && (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ borderTop: "1px solid #000", width: "180px", paddingTop: "4px" }}>
                        <div style={{ fontWeight: "bold", textTransform: "uppercase" }}>___________________</div>
                        <div style={{ fontStyle: "italic" }}>Authorised Signatory</div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Date stamp */}
            <div style={{ textAlign: "center", marginTop: "20px", fontSize: "12px", fontWeight: "bold" }}>
              {reportIssuedDate}
            </div>

            {/* QR code — moved to bottom of report */}
            {qrApiUrl && (
              <div style={{ textAlign: "center", marginTop: "16px" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrApiUrl} alt="Report QR" style={{ width: "70px", height: "70px" }} />
                <div style={{ fontSize: "7px", color: "#666", marginTop: "2px" }}>Scan to verify</div>
              </div>
            )}

            {/* Revision history — only show if there are entries */}
            {revisionHistory.length > 0 && (
              <div style={{ marginTop: "12px", borderTop: "1px solid #ccc", paddingTop: "6px", fontSize: "8px", color: "#555" }}>
                <p style={{ fontWeight: "bold", textTransform: "uppercase", marginBottom: "4px" }}>Revision History</p>
                {[...revisionHistory].reverse().map((entry, i) => (
                  <div key={i} style={{ marginBottom: "3px" }}>
                    <strong>{entry.action?.toUpperCase()}</strong>
                    {" — "}
                    {entry.timestamp ? format(new Date(entry.timestamp), "dd MMM yyyy HH:mm") : ""}
                    {entry.reason ? ` — ${entry.reason}` : ""}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Revision history panel (UI only, not printed inline) */}
        {revisionHistory.length > 0 && (
          <div className="px-8 pb-4 border-t border-gray-100 bg-gray-50 rounded-b-lg">
            <div className="pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Revision History
              </p>
              <div className="space-y-1.5">
                {[...revisionHistory].reverse().map((entry, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                    <span className={`px-1.5 py-0.5 rounded font-medium text-[10px] ${
                      entry.action === "issued" ? "bg-green-100 text-green-700" :
                      entry.action === "amended" ? "bg-amber-100 text-amber-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>{entry.action?.toUpperCase()}</span>
                    <span className="text-gray-400">{entry.timestamp ? format(new Date(entry.timestamp), "dd MMM yyyy HH:mm") : ""}</span>
                    {entry.reason && <span className="text-gray-600">— {entry.reason}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
