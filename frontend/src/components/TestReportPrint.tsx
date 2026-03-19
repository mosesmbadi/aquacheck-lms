"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Printer, X } from "lucide-react";
import { samplesApi, testResultsApi, testCatalogApi, contractsApi, customersApi } from "@/lib/api";
import type { Sample, TestResult, TestCatalogItem, Contract, Customer } from "@/lib/types";

interface TestReportPrintProps {
  sampleId: number;
  onClose: () => void;
}

function getCompliance(item: TestCatalogItem, value: string): string {
  if (!value || !item.standard_limit || item.standard_limit === "—") return "";
  const limit = item.standard_limit;
  if (limit === "Not Detectable") {
    const lower = value.toLowerCase();
    return lower === "nd" || lower === "not detectable" || lower === "not detected" || lower === "0"
      ? "COMPLIANT"
      : "NON-COMPLIANT";
  }
  const rangeMatch = limit.match(/^([\d.]+)\s*[–-]\s*([\d.]+)$/);
  if (rangeMatch) {
    const num = parseFloat(value);
    if (isNaN(num)) return "";
    return num >= parseFloat(rangeMatch[1]) && num <= parseFloat(rangeMatch[2]) ? "COMPLIANT" : "NON-COMPLIANT";
  }
  const limitNum = parseFloat(limit);
  const valNum = parseFloat(value);
  if (!isNaN(limitNum) && !isNaN(valNum)) {
    return valNum <= limitNum ? "COMPLIANT" : "NON-COMPLIANT";
  }
  return "";
}

export default function TestReportPrint({ sampleId, onClose }: TestReportPrintProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [printing, setPrinting] = useState(false);

  const { data: sample } = useQuery({
    queryKey: ["sample", sampleId],
    queryFn: () => samplesApi.get(sampleId).then((r) => r.data),
  });

  const { data: testResults = [] } = useQuery({
    queryKey: ["test-results", { sample_id: sampleId }],
    queryFn: () => testResultsApi.list({ sample_id: sampleId }).then((r) => r.data),
  });

  const { data: catalogItems = [] } = useQuery({
    queryKey: ["test-catalog"],
    queryFn: () => testCatalogApi.list({ active_only: true }).then((r) => r.data),
  });

  const { data: contract } = useQuery({
    queryKey: ["contract", sample?.contract_id],
    queryFn: () => contractsApi.get(sample!.contract_id!).then((r) => r.data),
    enabled: !!sample?.contract_id,
  });

  const { data: customer } = useQuery({
    queryKey: ["customer", contract?.customer_id],
    queryFn: () => customersApi.get(contract!.customer_id).then((r) => r.data),
    enabled: !!contract?.customer_id,
  });

  const resultByCatalog: Record<number, TestResult> = {};
  for (const tr of testResults) {
    if (tr.catalog_item_id) resultByCatalog[tr.catalog_item_id] = tr;
  }

  const physicochemical = catalogItems.filter((c) => c.category === "physicochemical");
  const microbiological = catalogItems.filter((c) => c.category === "microbiological");

  // Check overall compliance
  const allResults = catalogItems
    .map((item) => {
      const tr = resultByCatalog[item.id];
      if (!tr?.result_value) return null;
      return getCompliance(item, tr.result_value);
    })
    .filter(Boolean);
  const hasNonCompliant = allResults.includes("NON-COMPLIANT");
  const nonCompliantItems = catalogItems.filter((item) => {
    const tr = resultByCatalog[item.id];
    return tr?.result_value && getCompliance(item, tr.result_value) === "NON-COMPLIANT";
  });

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
          <title>Test Report - ${sample?.sample_code || ""}</title>
          <style>
            @page { size: A4; margin: 15mm; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Times New Roman', Times, serif; font-size: 11px; color: #000; }
            .report { max-width: 700px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 10px; }
            .header h1 { font-size: 18px; font-weight: bold; letter-spacing: 2px; margin-bottom: 2px; }
            .header .subtitle { font-size: 10px; color: #555; margin-bottom: 2px; }
            .header .company-info { font-size: 9px; text-align: right; color: #333; line-height: 1.4; }
            .title { text-align: center; font-size: 16px; font-weight: bold; text-decoration: underline; margin: 10px 0; }
            .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 11px; }
            .meta-table td { padding: 2px 4px; vertical-align: top; }
            .meta-label { font-weight: bold; white-space: nowrap; }
            .meta-value { text-transform: uppercase; }
            .results-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 10px; }
            .results-table th, .results-table td { border: 1px solid #000; padding: 3px 5px; text-align: left; }
            .results-table th { background: #e0e0e0; font-weight: bold; font-size: 10px; text-transform: uppercase; }
            .section-header { background: #333 !important; color: #fff !important; font-weight: bold; text-transform: uppercase; font-size: 10px; }
            .section-header td { border: 1px solid #000; padding: 4px 5px; }
            .compliant { }
            .non-compliant { font-weight: bold; }
            .notes-section { font-size: 9px; margin: 8px 0; line-height: 1.5; }
            .notes-section p { margin-bottom: 4px; }
            .notes-section strong { font-weight: bold; }
            .disclaimer { font-size: 9px; margin: 8px 0; font-style: italic; line-height: 1.4; }
            .disclaimer strong { font-style: normal; text-decoration: underline; }
            .comments { font-size: 10px; margin: 8px 0; line-height: 1.4; }
            .comments strong { text-decoration: underline; }
            .signatures { display: flex; justify-content: space-between; margin-top: 30px; font-size: 11px; }
            .signature-block { text-align: center; }
            .signature-block .name { font-weight: bold; text-transform: uppercase; }
            .signature-block .title-text { font-style: italic; }
            .report-date { text-align: center; margin-top: 15px; font-size: 12px; font-weight: bold; }
          </style>
        </head>
        <body>
          ${content.innerHTML}
        </body>
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
  const analysisDate = receivedDate;
  const reportIssuedDate = format(new Date(), "dd/MM/yyyy");

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
                <div style={{ fontSize: "20px", fontWeight: "bold", letterSpacing: "2px" }}>AQUACHECK</div>
                <div style={{ fontSize: "9px", color: "#555", fontStyle: "italic" }}>Trusted Quality Check Partner</div>
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

            {/* Title */}
            <div style={{ textAlign: "center", fontSize: "16px", fontWeight: "bold", textDecoration: "underline", margin: "12px 0" }}>
              TEST REPORT
            </div>

            {/* Meta info */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "10px", fontSize: "11px" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "2px 4px" }}><strong>SAMPLE DESCRIPTION:</strong></td>
                  <td style={{ padding: "2px 4px", textTransform: "uppercase" }}>{sample.description || sample.sample_type || "WATER SAMPLE"}</td>
                  <td style={{ padding: "2px 4px" }}></td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}><strong>SAMPLING DATE:</strong></td>
                  <td style={{ padding: "2px 4px" }}>{samplingDate}</td>
                </tr>
                <tr>
                  <td style={{ padding: "2px 4px" }}><strong>SUBMITTED BY:</strong></td>
                  <td style={{ padding: "2px 4px", textTransform: "uppercase" }}>{customer?.name || "—"}</td>
                  <td style={{ padding: "2px 4px" }}></td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}><strong>RECEIVED ON:</strong></td>
                  <td style={{ padding: "2px 4px" }}>{receivedDate}</td>
                </tr>
                <tr>
                  <td style={{ padding: "2px 4px" }}><strong>CLIENT CONTACT:</strong></td>
                  <td style={{ padding: "2px 4px", textTransform: "uppercase" }}>{customer?.contact_person || "—"}{customer?.phone ? ` - ${customer.phone}` : ""}</td>
                  <td style={{ padding: "2px 4px" }}></td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}><strong>ANALYSIS DATE:</strong></td>
                  <td style={{ padding: "2px 4px" }}>{analysisDate}</td>
                </tr>
                <tr>
                  <td style={{ padding: "2px 4px" }}><strong>SAMPLED BY:</strong></td>
                  <td style={{ padding: "2px 4px", textTransform: "uppercase" }}>AQUACHECK LABORATORIES LTD</td>
                  <td style={{ padding: "2px 4px" }}></td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}><strong>REPORT ISSUED ON:</strong></td>
                  <td style={{ padding: "2px 4px" }}>{reportIssuedDate}</td>
                </tr>
                <tr>
                  <td style={{ padding: "2px 4px" }}><strong>SAMPLING LOCATION:</strong></td>
                  <td style={{ padding: "2px 4px", textTransform: "uppercase" }} colSpan={2}>{sample.collection_location || "—"}</td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}><strong>SAMPLE LAB ID:</strong></td>
                  <td style={{ padding: "2px 4px" }}>{sample.sample_code}</td>
                </tr>
              </tbody>
            </table>

            {/* Results table */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "8px", fontSize: "10px" }}>
              <thead>
                <tr style={{ background: "#333", color: "#fff" }}>
                  <td colSpan={5} style={{ border: "1px solid #000", padding: "4px 5px", fontWeight: "bold", textTransform: "uppercase" }}>
                    PHYSIO-CHEMICAL TEST
                  </td>
                </tr>
                <tr style={{ background: "#e0e0e0" }}>
                  <th style={{ border: "1px solid #000", padding: "3px 5px", textAlign: "left" }}></th>
                  <th style={{ border: "1px solid #000", padding: "3px 5px", textAlign: "left" }}>METHOD</th>
                  <th style={{ border: "1px solid #000", padding: "3px 5px", textAlign: "center" }}>RESULTS</th>
                  <th style={{ border: "1px solid #000", padding: "3px 5px", textAlign: "center" }}>KS EAS 12:2018<br />Treated Potable water limit</th>
                  <th style={{ border: "1px solid #000", padding: "3px 5px", textAlign: "center" }}>REMARKS</th>
                </tr>
              </thead>
              <tbody>
                {physicochemical.map((item) => {
                  const tr = resultByCatalog[item.id];
                  const value = tr?.result_value || "ND";
                  const compliance = getCompliance(item, value);
                  return (
                    <tr key={item.id}>
                      <td style={{ border: "1px solid #000", padding: "2px 5px" }}>{item.name}</td>
                      <td style={{ border: "1px solid #000", padding: "2px 5px" }}>{item.method_name || "—"}</td>
                      <td style={{ border: "1px solid #000", padding: "2px 5px", textAlign: "center" }}>{value}</td>
                      <td style={{ border: "1px solid #000", padding: "2px 5px", textAlign: "center" }}>{item.standard_limit || "NS"}</td>
                      <td style={{ border: "1px solid #000", padding: "2px 5px", textAlign: "center", fontWeight: compliance === "NON-COMPLIANT" ? "bold" : "normal" }}>
                        {compliance || "NS"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Microbiological */}
              <thead>
                <tr style={{ background: "#333", color: "#fff" }}>
                  <td colSpan={5} style={{ border: "1px solid #000", padding: "4px 5px", fontWeight: "bold", textTransform: "uppercase" }}>
                    MICROBIOLOGICAL TEST
                  </td>
                </tr>
              </thead>
              <tbody>
                {microbiological.map((item) => {
                  const tr = resultByCatalog[item.id];
                  const value = tr?.result_value || "ND";
                  const compliance = getCompliance(item, value);
                  return (
                    <tr key={item.id}>
                      <td style={{ border: "1px solid #000", padding: "2px 5px" }}>{item.name}</td>
                      <td style={{ border: "1px solid #000", padding: "2px 5px" }}>{item.method_name || "—"}</td>
                      <td style={{ border: "1px solid #000", padding: "2px 5px", textAlign: "center" }}>{value}</td>
                      <td style={{ border: "1px solid #000", padding: "2px 5px", textAlign: "center" }}>{item.standard_limit || "NS"}</td>
                      <td style={{ border: "1px solid #000", padding: "2px 5px", textAlign: "center", fontWeight: compliance === "NON-COMPLIANT" ? "bold" : "normal" }}>
                        {compliance || "NS"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Notes */}
            <div style={{ fontSize: "9px", margin: "8px 0", lineHeight: "1.5" }}>
              <p><strong>NS:</strong> No Set Standard, <strong>ND:</strong> Not Detectable, <strong>TNTC:</strong> Too Numerous to count, <strong>KS:</strong> Kenya Standard, <strong>EAS:</strong> East African Standard, <strong>APHA:</strong> American Public Health Association, potable water: water that is safe and suitable for human consumption, <strong>CFU:</strong> Colony forming units.<strong>SPP:</strong> species, <strong>ISO:</strong> International Organisation for Standardisation.</p>
            </div>

            {/* Disclaimer */}
            <div style={{ fontSize: "9px", margin: "8px 0", fontStyle: "italic", lineHeight: "1.4" }}>
              <p><strong style={{ fontStyle: "normal", textDecoration: "underline" }}>DISCLAIMER.</strong></p>
              <p>These results only apply to the sample submitted and the recommendations/comments are only based on the tested parameters.</p>
              <p>The test report shall not be reproduced without the written approval of Aquacheck Laboratories Ltd.</p>
            </div>

            {/* Comments */}
            {hasNonCompliant && (
              <div style={{ fontSize: "10px", margin: "8px 0", lineHeight: "1.4" }}>
                <p><strong style={{ textDecoration: "underline" }}>COMMENTS.</strong></p>
                <p>
                  The sample does not comply with KS EAS 12:2018 specifications for treated potable water.
                  {nonCompliantItems.length > 0 && (
                    <> The {nonCompliantItems.map((i) => i.name).join(", ")} exceeded the set limit.</>
                  )}
                </p>
                <p>Further treatment is therefore recommended.</p>
              </div>
            )}
            {!hasNonCompliant && allResults.length > 0 && (
              <div style={{ fontSize: "10px", margin: "8px 0", lineHeight: "1.4" }}>
                <p><strong style={{ textDecoration: "underline" }}>COMMENTS.</strong></p>
                <p>The sample complies with KS EAS 12:2018 specifications for treated potable water.</p>
              </div>
            )}

            {/* Signatures */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "40px", fontSize: "11px" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ borderTop: "1px solid #000", width: "180px", paddingTop: "4px" }}>
                  <div style={{ fontWeight: "bold", textTransform: "uppercase" }}>VICTOR MUTAI</div>
                  <div style={{ fontStyle: "italic" }}>Water Chemist</div>
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ borderTop: "1px solid #000", width: "180px", paddingTop: "4px" }}>
                  <div style={{ fontWeight: "bold", textTransform: "uppercase" }}>KIPKEMOI JOSPHAT</div>
                  <div style={{ fontStyle: "italic" }}>Lab analyst</div>
                </div>
              </div>
            </div>

            {/* Date stamp */}
            <div style={{ textAlign: "center", marginTop: "20px", fontSize: "12px", fontWeight: "bold" }}>
              {format(new Date(), "d MMM yyyy").toUpperCase()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
