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
import { Select } from "@/components/ui/Input";
import { reportsApi, contractsApi } from "@/lib/api";
import type { Report } from "@/lib/types";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { getToken } from "@/lib/auth";

const schema = z.object({
  contract_id: z.coerce.number().min(1, "Select a contract"),
  report_type: z.enum(["test_report", "calibration_certificate", "sampling_report", "conformity_statement"]),
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

  const createMutation = useMutation({
    mutationFn: (data: Partial<Report>) => reportsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports"] }); setShowCreate(false); },
  });

  const issueMutation = useMutation({
    mutationFn: (id: number) => reportsApi.issue(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({ resolver: zodResolver(schema) });

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
    { key: "contract_id", header: "Contract", render: (r: Report) => <span className="text-gray-500 text-xs">#{r.contract_id}</span> },
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

      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); }} title="Create Report" size="md">
        <form onSubmit={handleSubmit(async (data) => { await createMutation.mutateAsync(data as Partial<Report>); reset(); })} className="space-y-4">
          <Select label="Contract" error={errors.contract_id?.message} {...register("contract_id")}>
            <option value="">Select contract...</option>
            {contracts.map((c) => <option key={c.id} value={c.id}>{c.contract_number} — {c.title}</option>)}
          </Select>
          <Select label="Report Type" error={errors.report_type?.message} {...register("report_type")}>
            <option value="test_report">Test Report</option>
            <option value="calibration_certificate">Calibration Certificate</option>
            <option value="sampling_report">Sampling Report</option>
            <option value="conformity_statement">Conformity Statement</option>
          </Select>
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => { setShowCreate(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Create Report</Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
