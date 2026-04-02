"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Download, Send } from "lucide-react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { ReportStatusBadge } from "@/components/ui/Badge";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { reportsApi, contractsApi, samplesApi } from "@/lib/api";
import type { Report, Sample } from "@/lib/types";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { getToken } from "@/lib/auth";

const schema = z.object({
  contract_id: z.coerce.number().min(1, "Select a contract"),
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

  const { register, handleSubmit, watch, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      report_type: "test_report",
      report_title: "Laboratory Test Report",
      overall_status: "COMPLETE",
      classification: "",
      client_reference: "",
      submitted_by: "",
      client_contact: "",
      sampled_by: "AQUACHECK LABORATORIES LTD",
      sample_lab_id: "",
      analysis_date: "",
      specification_title: "KS EAS 12:2018",
      disclaimer: "",
      authorizer_name: "Victor Mutai",
      authorizer_title: "Water Chemist",
      analyst_name: "",
      analyst_title: "Lab analyst",
      final_comment: "",
    },
  });

  const selectedContractId = Number(watch("contract_id") || 0);
  const filteredSamples = samples.filter((sample: Sample) => sample.contract_id === selectedContractId);

  const sampleCodeById = new Map<number, string>(samples.map((sample: Sample) => [sample.id, sample.sample_code]));

  const downloadPdf = (id: number) => {
    const url = reportsApi.pdfUrl(id);
    const token = getToken();
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `report-${id}.pdf`;
        a.click();
      });
  };

  const columns = [
    { key: "report_number", header: "Report #", render: (r: Report) => <span className="font-mono font-medium text-primary-600">{r.report_number}</span> },
    { key: "report_type", header: "Type", render: (r: Report) => <span className="text-xs capitalize">{r.report_type.replace(/_/g, " ")}</span> },
    { key: "sample_id", header: "Sample", render: (r: Report) => <span className="text-gray-500 text-xs">{r.content?.sample_id ? sampleCodeById.get(r.content.sample_id) ?? `#${r.content.sample_id}` : "Contract-level"}</span> },
    { key: "contract_id", header: "Contract", render: (r: Report) => <span className="text-gray-500 text-xs">#{r.contract_id}</span> },
    { key: "classification", header: "Outcome", render: (r: Report) => <span className="text-gray-700 text-xs">{String(r.content?.classification ?? "—")}</span> },
    { key: "status", header: "Status", render: (r: Report) => <ReportStatusBadge status={r.status} /> },
    { key: "issued_at", header: "Issued", render: (r: Report) => <span className="text-gray-500 text-xs">{r.issued_at ? format(new Date(r.issued_at), "MMM d, yyyy") : "—"}</span> },
    {
      key: "actions", header: "Actions",
      render: (r: Report) => (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {r.status === "draft" && (
            <Button size="sm" onClick={() => issueMutation.mutate(r.id)} loading={issueMutation.isPending}>
              <Send className="w-3.5 h-3.5" /> Issue
            </Button>
          )}
          {r.status === "issued" && (
            <Button size="sm" variant="secondary" onClick={() => downloadPdf(r.id)}>
              <Download className="w-3.5 h-3.5" /> PDF
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout title="Reports">
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" />New Report</Button>
        </div>
        <Table columns={columns as never} data={reports as never} loading={isLoading} emptyMessage="No reports generated." keyExtractor={(r) => (r as unknown as Report).id} />
      </div>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); }} title="Create Report" size="lg">
        <form onSubmit={handleSubmit(async (data) => {
          await createMutation.mutateAsync({
            contract_id: data.contract_id,
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
          <Select label="Contract" error={errors.contract_id?.message} {...register("contract_id")}>
            <option value="">Select contract...</option>
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
            <Input label="Specification Header" error={errors.specification_title?.message} {...register("specification_title")} placeholder="KS EAS 12:2018" />
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
            <Button type="submit" loading={createMutation.isPending}>Create Report</Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
