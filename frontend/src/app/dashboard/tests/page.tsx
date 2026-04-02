"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { TestStatusBadge } from "@/components/ui/Badge";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { testResultsApi, samplesApi, methodsApi } from "@/lib/api";
import type { TestResult } from "@/lib/types";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  sample_id: z.coerce.number().min(1, "Select a sample"),
  method_id: z.coerce.number().min(1, "Select a method"),
  result_value: z.string().optional(),
  result_unit: z.string().optional(),
  notes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function TestsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: tests = [], isLoading } = useQuery({
    queryKey: ["test-results"],
    queryFn: () => testResultsApi.list().then((r) => r.data),
  });
  const { data: samples = [] } = useQuery({ queryKey: ["samples"], queryFn: () => samplesApi.list().then((r) => r.data) });
  const { data: methods = [] } = useQuery({ queryKey: ["methods"], queryFn: () => methodsApi.list().then((r) => r.data) });
  const testableSamples = samples.filter((sample) => !!sample.contract_id);

  const createMutation = useMutation({
    mutationFn: (data: Partial<TestResult>) => testResultsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["test-results"] }); setShowCreate(false); },
  });

  const validateMutation = useMutation({
    mutationFn: (id: number) => testResultsApi.validate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["test-results"] }),
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({ resolver: zodResolver(schema) });

  const columns = [
    { key: "id", header: "Test ID", render: (r: TestResult) => <span className="font-mono text-primary-600">#{r.id}</span> },
    { key: "sample_id", header: "Sample", render: (r: TestResult) => {
      const s = samples.find((s) => s.id === r.sample_id);
      return <span className="font-mono text-xs">{s?.sample_code ?? `#${r.sample_id}`}</span>;
    }},
    { key: "method_id", header: "Method", render: (r: TestResult) => {
      const m = methods.find((m) => m.id === r.method_id);
      return <span className="text-xs">{m?.code ?? `#${r.method_id}`}</span>;
    }},
    { key: "status", header: "Status", render: (r: TestResult) => <TestStatusBadge status={r.status} /> },
    { key: "result_value", header: "Result", render: (r: TestResult) => r.result_value ? <span className="font-medium">{r.result_value} {r.result_unit}</span> : <span className="text-gray-400">—</span> },
    { key: "uncertainty_value", header: "Uncertainty", render: (r: TestResult) => r.uncertainty_value != null ? <span className="text-xs text-gray-600">±{r.uncertainty_value} {r.uncertainty_unit}</span> : <span className="text-gray-400">—</span> },
    { key: "created_at", header: "Created", render: (r: TestResult) => <span className="text-gray-500 text-xs">{format(new Date(r.created_at), "MMM d, yyyy")}</span> },
    {
      key: "actions", header: "Actions",
      render: (r: TestResult) => (
        <div onClick={(e) => e.stopPropagation()}>
          {(r.status === "completed" || r.status === "in_progress") && (
            <Button size="sm" onClick={() => validateMutation.mutate(r.id)} loading={validateMutation.isPending}>
              <CheckCircle className="w-3.5 h-3.5" /> Validate
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout title="Test Results">
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" />New Test</Button>
        </div>
        <Table columns={columns as never} data={tests as never} loading={isLoading} emptyMessage="No test results recorded." keyExtractor={(r) => (r as unknown as TestResult).id} />
      </div>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); }} title="Record Test Result" size="lg">
        <form onSubmit={handleSubmit(async (data) => { await createMutation.mutateAsync(data as Partial<TestResult>); reset(); })} className="space-y-4">
          <Select label="Sample" error={errors.sample_id?.message} {...register("sample_id")}>
            <option value="">Select sample...</option>
            {testableSamples.map((s) => <option key={s.id} value={s.id}>{s.sample_code}</option>)}
          </Select>
          {testableSamples.length < samples.length && (
            <p className="text-xs text-gray-500">
              Standalone samples are excluded here. Link a sample to a contract before recording test results.
            </p>
          )}
          <Select label="Method" error={errors.method_id?.message} {...register("method_id")}>
            <option value="">Select method...</option>
            {methods.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Result Value" {...register("result_value")} placeholder="e.g. 7.2" />
            <Input label="Result Unit" {...register("result_unit")} placeholder="e.g. mg/L, NTU" />
          </div>
          <Textarea label="Notes" {...register("notes")} rows={2} placeholder="Optional notes..." />
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => { setShowCreate(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Record Result</Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
