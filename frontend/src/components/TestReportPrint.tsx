"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Printer, X, Clock, Download, ExternalLink, Loader2 } from "lucide-react";
import { samplesApi, reportsApi } from "@/lib/api";
import type { Sample, Report, User } from "@/lib/types";
import { getCurrentUser } from "@/lib/auth";

interface TestReportPrintProps {
  sampleId: number;
  reportId?: number;
  onClose: () => void;
  /** Staff picked on the sample page to sign this printout instead of the report's signatories. */
  signatories?: User[];
}

/**
 * Test report preview. It shows the PDF the server generates — the one document that is
 * printed, downloaded and emailed — so what staff see here is exactly what is issued.
 */
export default function TestReportPrint({ sampleId, reportId, onClose, signatories = [] }: TestReportPrintProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: sample } = useQuery<Sample>({
    queryKey: ["sample", sampleId],
    queryFn: () => samplesApi.get(sampleId).then((r) => r.data),
  });

  // Customers can't create reports, and only ever see issued ones.
  const isCustomer = getCurrentUser()?.role === "customer";
  // The sample's report may still be a draft that the Reports page hides until its
  // results are validated — fetch it anyway, or the preview would create a duplicate.
  const { data: sampleReports = [], isSuccess: reportsLoaded, isFetching: reportsFetching } = useQuery<Report[]>({
    queryKey: ["reports", "sample", sampleId],
    queryFn: () => reportsApi.list({ include_pending: !isCustomer, sample_id: sampleId }).then((r) => r.data),
  });
  const report = reportId ? sampleReports.find((r) => r.id === reportId) : sampleReports[0];

  const createReport = useMutation<Report, unknown, void>({
    mutationFn: () =>
      reportsApi.create({
        contract_id: sample?.contract_id,
        report_type: "test_report",
        content: { sample_id: sampleId },
      }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });

  // Wait for the reports list (and any refetch) to settle first — until it has, "no
  // report found" only means "not loaded yet", and creating one then duplicates it.
  useEffect(() => {
    if (
      !isCustomer && !reportId && sample && reportsLoaded && !reportsFetching && !report &&
      createReport.isIdle
    ) {
      createReport.mutate();
    }
  }, [reportId, sample?.id, report?.id, reportsLoaded, reportsFetching]);

  const signerIds = useMemo(() => signatories.map((u) => u.id), [signatories]);
  // Regenerated on every open: the PDF reflects the sample's current results.
  const { data: pdfBlob, isError: pdfFailed } = useQuery<Blob>({
    queryKey: ["report-pdf", report?.id, signerIds.join(","), report?.updated_at],
    queryFn: () => reportsApi.pdfBlob(report!.id, signerIds),
    enabled: !!report,
    gcTime: 0,
  });

  useEffect(() => {
    if (!pdfBlob) return;
    const url = URL.createObjectURL(pdfBlob);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pdfBlob]);

  const handlePrint = () => {
    const frame = frameRef.current?.contentWindow;
    try {
      frame?.focus();
      frame?.print();
    } catch {
      // Some browsers can't print a PDF from inside a frame; their own viewer can.
      if (pdfUrl) window.open(pdfUrl, "_blank");
    }
  };

  const revisionHistory = report?.revision_history ?? [];
  const reportNumber = report?.report_number ?? "";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto py-8">
      <div className="bg-white rounded-lg shadow-xl max-w-[900px] w-full mx-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b bg-gray-50 rounded-t-lg sticky top-0 z-10">
          <h3 className="font-semibold text-gray-800">
            Test Report Preview{reportNumber && <span className="ml-2 text-sm font-normal text-gray-500">{reportNumber}</span>}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={!pdfUrl}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
            <button
              onClick={() => report && reportsApi.downloadPdf(report.id, report.report_number)}
              disabled={!report}
              title="Download PDF"
              className="p-2 text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              <Download className="w-5 h-5" />
            </button>
            <a
              href={pdfUrl ?? undefined}
              target="_blank"
              rel="noreferrer"
              title="Open in a new tab"
              aria-disabled={!pdfUrl}
              className={`p-2 text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-200 ${pdfUrl ? "" : "pointer-events-none opacity-50"}`}
            >
              <ExternalLink className="w-5 h-5" />
            </a>
            <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-200">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Report */}
        <div className="bg-gray-100">
          {pdfUrl ? (
            <iframe ref={frameRef} src={pdfUrl} title="Test report" className="w-full h-[80vh] border-0" />
          ) : (
            <div className="h-[60vh] flex items-center justify-center text-sm text-gray-500 gap-2">
              {pdfFailed ? (
                "The report could not be generated. Close this window and try again."
              ) : (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Generating report…
                </>
              )}
            </div>
          )}
        </div>

        {/* Revision history panel (UI only; the report prints its own) */}
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
