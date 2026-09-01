"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Download, Printer, Send, Pencil, History, Clock } from "lucide-react";
import { apiErrorMessage } from "@/lib/utils";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { ReportStatusBadge } from "@/components/ui/Badge";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { reportsApi, contractsApi, samplesApi } from "@/lib/api";
import type { Report, Sample } from "@/lib/types";
import TestReportPrint from "@/components/TestReportPrint";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({
  contract_id: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.coerce.number().int().positive().optional()
  ),
  sample_id: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.coerce.number().int().positive().optional()
  ),
  report_type: z.enum(["test_report", "calibration_certificate", "sampling_report", "conformity_statement"]),
  client_reference: z.string().optional(),
  report_title: z.string().min(2, "Report title is required"),
  overall_status: z.string().min(2, "Overall status is required"),
  classification: z.string().optional(),
  submitted_by: z.string().optional(),
  client_contact: z.string().optional(),
  sampled_by: z.string().optional(),
  sample_lab_id: z.string().optional(),
  analysis_date: z.string().optional(),
  specification_title: z.string().optional(),
  disclaimer: z.string().optional(),
  authorizer_name: z.string().optional(),
  authorizer_title: z.string().optional(),
  analyst_name: z.string().optional(),
  analyst_title: z.string().optional(),
  final_comment: z.string().optional(),
}).superRefine((data, ctx) => {
  if (["test_report", "sampling_report"].includes(data.report_type) && !data.sample_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sample_id"],
      message: "Select a sample for this report type",
    });
  }
});
type FormData = z.infer<typeof schema>;

export default function ReportsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editReport, setEditReport] = useState<Report | null>(null);
  const [historyReport, setHistoryReport] = useState<Report | null>(null);
  const [printReport, setPrintReport] = useState<Report | null>(null);
  const currentUser = getCurrentUser();
  const isCustomer = currentUser?.role === "customer";

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["reports"],
    queryFn: () => reportsApi.list().then((r) => r.data),
  });
  const { data: contracts = [] } = useQuery({ queryKey: ["contracts"], queryFn: () => contractsApi.list().then((r) => r.data) });
  const { data: samples = [] } = useQuery({ queryKey: ["samples"], queryFn: () => samplesApi.list().then((r) => r.data) });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Report>) => reportsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports"] }); setShowCreate(false); },
  });

  const issueMutation = useMutation({
    mutationFn: (id: number) => reportsApi.issue(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; payload: Parameters<typeof reportsApi.update>[1] }) =>
      reportsApi.update(data.id, data.payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports"] }); setEditReport(null); },
    onError: (err: unknown) => {
      console.error("Report update failed:", apiErrorMessage(err));
    },
  });

  const SCHEDULE_SPEC_HEADERS: Record<number, string> = {
    3: "NEMA STANDARD FOR EFFLUENT WATER; THIRD SCHEDULE. Maximum levels Permissible.",
    4: "NEMA MONITORING GUIDE; FOURTH SCHEDULE.",
    5: "NEMA STANDARD FOR EFFLUENT WATER; FIFTH SCHEDULE. Maximum levels Permissible.",
    6: "NEMA MONITORING STANDARD; SIXTH SCHEDULE.",
  };

  const { register, handleSubmit, watch, setValue, formState: { errors, isValid }, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      report_type: "test_report",
      report_title: "TEST REPORT",
      overall_status: "COMPLETE",
      classification: "",
      client_reference: "",
      submitted_by: "",
      client_contact: "",
      sampled_by: "AQUACHECK LABORATORIES LTD",
      sample_lab_id: "",
      analysis_date: "",
      specification_title: "",
      disclaimer: "",
      authorizer_name: "Victor Mutai",
      authorizer_title: "Water Chemist",
      analyst_name: "",
      analyst_title: "Lab analyst",
      final_comment: "",
    },
  });

  const selectedContractId = Number(watch("contract_id") || 0);
  const selectedSampleId = Number(watch("sample_id") || 0);
  const filteredSamples = selectedContractId > 0
    ? samples.filter((sample: Sample) => sample.contract_id === selectedContractId)
    : samples;

  // Auto-set specification_title from the selected sample's waste_schedule
  useEffect(() => {
    if (!selectedSampleId) return;
    const sample = samples.find((s: Sample) => s.id === selectedSampleId);
    if (!sample) return;
    if (sample.waste_schedule && SCHEDULE_SPEC_HEADERS[sample.waste_schedule]) {
      setValue("specification_title", "");  // leave blank → backend uses schedule-based header
    } else {
      setValue("specification_title", "");  // leave blank for dialysis/potable too → backend uses "SPECIFICATION"
    }
  }, [selectedSampleId, samples]);  // eslint-disable-line

  const sampleCodeById = new Map<number, string>(samples.map((sample: Sample) => [sample.id, sample.sample_code]));

  const columns = [
    { key: "report_number", header: "Report #", render: (r: Report) => <span className="font-mono font-medium text-primary-600">{r.report_number}</span> },
    { key: "report_type", header: "Type", render: (r: Report) => <span className="text-xs capitalize">{r.report_type.replace(/_/g, " ")}</span> },
    { key: "sample_id", header: "Sample", render: (r: Report) => <span className="text-gray-500 text-xs">{r.content?.sample_id ? sampleCodeById.get(r.content.sample_id) ?? `#${r.content.sample_id}` : "Contract-level"}</span> },
    { key: "contract_id", header: "Contract", render: (r: Report) => <span className="text-gray-500 text-xs">{r.contract_id ? `#${r.contract_id}` : "Standalone"}</span> },
    { key: "classification", header: "Outcome", render: (r: Report) => <span className="text-gray-700 text-xs">{String(r.content?.classification ?? "—")}</span> },
    { key: "status", header: "Status", render: (r: Report) => <ReportStatusBadge status={r.status} /> },
    { key: "issued_at", header: "Issued", render: (r: Report) => <span className="text-gray-500 text-xs">{r.issued_at ? format(new Date(r.issued_at), "MMM d, yyyy") : "—"}</span> },
    {
      key: "actions", header: "Actions",
      render: (r: Report) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {!isCustomer && r.status === "draft" && (
            <Button size="sm" onClick={() => issueMutation.mutate(r.id)} loading={issueMutation.isPending}>
              <Send className="w-3.5 h-3.5" /> Issue
            </Button>
          )}
          {(r.status === "issued" || r.status === "amended") && r.content?.sample_id && (
            <Button size="sm" variant="secondary" onClick={() => setPrintReport(r)}>
              <Printer className="w-3.5 h-3.5" /> View / Print
            </Button>
          )}
          {(r.status === "issued" || r.status === "amended") && !r.content?.sample_id && (
            <Button size="sm" variant="secondary" onClick={() => reportsApi.downloadPdf(r.id, r.report_number)}>
              <Download className="w-3.5 h-3.5" /> PDF
            </Button>
          )}
          {!isCustomer && (r.status === "issued" || r.status === "amended" || r.status === "draft") && (
            <button
              onClick={() => setEditReport(r)}
              className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded"
              title="Edit report"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {r.revision_history && r.revision_history.length > 0 && (
            <button
              onClick={() => setHistoryReport(r)}
              className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded"
              title="View revision history"
            >
              <History className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout title="Reports">
      <div className="space-y-4">
        {!isCustomer && (
          <div className="flex justify-end">
            <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" />New Report</Button>
          </div>
        )}
        <Table<Report> columns={columns} data={reports} loading={isLoading} emptyMessage="No reports generated." keyExtractor={(r) => r.id} />
      </div>

      {/* ── View / Print Report (same layout as Samples page) ───────────────── */}
      {printReport && printReport.content?.sample_id && (
        <TestReportPrint
          sampleId={printReport.content.sample_id}
          reportId={printReport.id}
          onClose={() => setPrintReport(null)}
        />
      )}

      {/* ── Edit Report Modal ──────────────────────────────────────────────── */}
      {editReport && (
        <ReportEditModal
          report={editReport}
          samples={samples}
          onClose={() => setEditReport(null)}
          onSaved={(updated) => {
            qc.invalidateQueries({ queryKey: ["reports"] });
            setEditReport(null);
          }}
          updateMutation={updateMutation}
        />
      )}

      {/* ── Revision History Modal ─────────────────────────────────────────── */}
      {historyReport && (
        <Modal open onClose={() => setHistoryReport(null)} title={`Revision History — ${historyReport.report_number}`} size="md">
          <div className="space-y-3">
            {(historyReport.revision_history ?? []).length === 0 ? (
              <p className="text-sm text-gray-400 italic">No revision history.</p>
            ) : (
              [...(historyReport.revision_history ?? [])].reverse().map((entry, i) => (
                <div key={i} className="flex gap-3 pb-3 border-b border-gray-100 last:border-0">
                  <div className="flex-shrink-0 mt-1">
                    <Clock className="w-4 h-4 text-gray-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        entry.action === "issued" ? "bg-green-100 text-green-700" :
                        entry.action === "amended" ? "bg-amber-100 text-amber-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {entry.action.toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-500">
                        {format(new Date(entry.timestamp), "dd MMM yyyy HH:mm")}
                      </span>
                    </div>
                    {entry.reason && (
                      <p className="text-sm text-gray-700 mt-1">
                        <span className="font-medium text-gray-500">Reason: </span>{entry.reason}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setHistoryReport(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}

      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); }} title="Create Report" size="lg">
        <form onSubmit={handleSubmit(async (data) => {
          await createMutation.mutateAsync({
            contract_id: data.contract_id || undefined,
            report_type: data.report_type,
            content: {
              sample_id: data.sample_id,
              client_reference: data.client_reference || undefined,
              report_title: data.report_title,
              overall_status: data.overall_status,
              classification: data.classification || undefined,
              submitted_by: data.submitted_by || undefined,
              client_contact: data.client_contact || undefined,
              sampled_by: data.sampled_by || undefined,
              sample_lab_id: data.sample_lab_id || undefined,
              analysis_date: data.analysis_date || undefined,
              specification_title: data.specification_title || undefined,
              disclaimer: data.disclaimer || undefined,
              authorizer_name: data.authorizer_name || undefined,
              authorizer_title: data.authorizer_title || undefined,
              analyst_name: data.analyst_name || undefined,
              analyst_title: data.analyst_title || undefined,
              final_comment: data.final_comment || undefined,
            },
          } as Partial<Report>);
          reset();
        })} className="space-y-4">
          <Select label="Contract (optional — leave blank for a standalone sample)" error={errors.contract_id?.message} {...register("contract_id")}>
            <option value="">No contract / standalone</option>
            {contracts.map((c) => <option key={c.id} value={c.id}>{c.contract_number} — {c.title}</option>)}
          </Select>
          <Select label="Sample" error={errors.sample_id?.message} {...register("sample_id")}>
            <option value="">Select sample...</option>
            {filteredSamples.map((sample) => <option key={sample.id} value={sample.id}>{sample.sample_code} — {sample.sample_type ?? "Sample"}</option>)}
          </Select>
          <Select label="Report Type" error={errors.report_type?.message} {...register("report_type")}>
            <option value="test_report">Test Report</option>
            <option value="calibration_certificate">Calibration Certificate</option>
            <option value="sampling_report">Sampling Report</option>
            <option value="conformity_statement">Conformity Statement</option>
          </Select>
          <Input label="Report Title" error={errors.report_title?.message} {...register("report_title")} placeholder="Laboratory Test Report" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Client Reference" error={errors.client_reference?.message} {...register("client_reference")} placeholder="e.g. QT 1479" />
            <Input label="Overall Status" error={errors.overall_status?.message} {...register("overall_status")} placeholder="COMPLETE" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Submitted By" error={errors.submitted_by?.message} {...register("submitted_by")} placeholder="Customer / company name" />
            <Input label="Client Contact" error={errors.client_contact?.message} {...register("client_contact")} placeholder="Phone or contact person" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Sampled By" error={errors.sampled_by?.message} {...register("sampled_by")} placeholder="Sampler name or lab" />
            <Input label="Sample Lab ID" error={errors.sample_lab_id?.message} {...register("sample_lab_id")} placeholder="e.g. QT/1479/2026" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Analysis Date" type="date" error={errors.analysis_date?.message} {...register("analysis_date")} />
            <Input label="Specification Header (leave blank to auto-detect from sample schedule)" error={errors.specification_title?.message} {...register("specification_title")} placeholder="Auto-detected from sample schedule" />
          </div>
          <Input label="Classification / Verdict" error={errors.classification?.message} {...register("classification")} placeholder="e.g. NPOTABLE" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Authorizer Name" error={errors.authorizer_name?.message} {...register("authorizer_name")} placeholder="Victor Mutai" />
            <Input label="Authorizer Title" error={errors.authorizer_title?.message} {...register("authorizer_title")} placeholder="Water Chemist" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Analyst Name" error={errors.analyst_name?.message} {...register("analyst_name")} placeholder="Kipkemoi Josphat" />
            <Input label="Analyst Title" error={errors.analyst_title?.message} {...register("analyst_title")} placeholder="Lab analyst" />
          </div>
          <Textarea label="Conclusion / Remarks" error={errors.final_comment?.message} {...register("final_comment")} rows={4} placeholder="Summary of the final result and any remarks to appear on the report." />
          <Textarea label="Disclaimer Override" error={errors.disclaimer?.message} {...register("disclaimer")} rows={3} placeholder="Optional custom disclaimer text for this report." />
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => { setShowCreate(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending} disabled={!isValid}>Create Report</Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}

// ─── Report Edit Modal ────────────────────────────────────────────────────────

function ReportEditModal({
  report,
  samples,
  onClose,
  onSaved,
  updateMutation,
}: {
  report: Report;
  samples: Sample[];
  onClose: () => void;
  onSaved: (r: Report) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateMutation: any;
}) {
  const isIssued = report.status === "issued" || report.status === "amended";
  const content = report.content || {};

  const [fields, setFields] = useState({
    report_title: String(content.report_title ?? "TEST REPORT"),
    overall_status: String(content.overall_status ?? "COMPLETE"),
    classification: String(content.classification ?? ""),
    submitted_by: String(content.submitted_by ?? ""),
    client_contact: String(content.client_contact ?? ""),
    sampled_by: String(content.sampled_by ?? "AQUACHECK LABORATORIES LTD"),
    sample_lab_id: String(content.sample_lab_id ?? ""),
    analysis_date: String(content.analysis_date ?? ""),
    specification_title: String(content.specification_title ?? ""),
    authorizer_name: String(content.authorizer_name ?? "Victor Mutai"),
    authorizer_title: String(content.authorizer_title ?? "Water Chemist"),
    analyst_name: String(content.analyst_name ?? ""),
    analyst_title: String(content.analyst_title ?? "Lab analyst"),
    final_comment: String(content.final_comment ?? ""),
    disclaimer: String(content.disclaimer ?? ""),
  });
  const [amendmentReason, setAmendmentReason] = useState("");
  const [error, setError] = useState("");

  const set = (key: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));

  const handleSave = () => {
    setError("");
    if (isIssued && !amendmentReason.trim()) {
      setError("Please provide a reason for this amendment.");
      return;
    }
    updateMutation.mutate({
      id: report.id,
      payload: {
        content: { ...content, ...fields },
        amendment_reason: amendmentReason || undefined,
      },
    }, {
      onSuccess: (r: Report) => onSaved(r),
      onError: (err: unknown) => {
        setError(apiErrorMessage(err, "Failed to save changes. Please try again."));
      },
    });
  };

  return (
    <Modal open onClose={onClose} title={`Edit Report — ${report.report_number}`} size="lg">
      <div className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded border border-red-200">{error}</p>}

        {isIssued && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-800 font-semibold mb-1">This report has been issued. Editing will mark it as AMENDED.</p>
            <Textarea
              label="Reason for Amendment *"
              rows={2}
              value={amendmentReason}
              onChange={(e) => setAmendmentReason(e.target.value)}
              placeholder="e.g. Corrected pH result value, updated client reference"
            />
          </div>
        )}

        <Input label="Report Title" value={fields.report_title} onChange={set("report_title")} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Overall Status" value={fields.overall_status} onChange={set("overall_status")} />
          <Input label="Classification / Verdict" value={fields.classification} onChange={set("classification")} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Submitted By" value={fields.submitted_by} onChange={set("submitted_by")} />
          <Input label="Client Contact" value={fields.client_contact} onChange={set("client_contact")} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Sampled By" value={fields.sampled_by} onChange={set("sampled_by")} />
          <Input label="Sample Lab ID" value={fields.sample_lab_id} onChange={set("sample_lab_id")} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Analysis Date" type="date" value={fields.analysis_date} onChange={set("analysis_date")} />
          <Input label="Specification Header" value={fields.specification_title} onChange={set("specification_title")} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Authorizer Name" value={fields.authorizer_name} onChange={set("authorizer_name")} />
          <Input label="Authorizer Title" value={fields.authorizer_title} onChange={set("authorizer_title")} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Analyst Name" value={fields.analyst_name} onChange={set("analyst_name")} />
          <Input label="Analyst Title" value={fields.analyst_title} onChange={set("analyst_title")} />
        </div>
        <Textarea label="Conclusion / Remarks" rows={3} value={fields.final_comment} onChange={set("final_comment")} />
        <Textarea label="Disclaimer Override" rows={2} value={fields.disclaimer} onChange={set("disclaimer")} />

        <div className="flex gap-3 justify-end pt-2 border-t">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={updateMutation.isPending}>
            {isIssued ? "Save Amendment" : "Save Changes"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
