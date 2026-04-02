"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, PauseCircle, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { RiskLevelBadge, Badge } from "@/components/ui/Badge";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { ncApi } from "@/lib/api";
import type { Nonconformity } from "@/lib/types";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  description: z.string().min(10, "Provide a detailed description"),
  risk_level: z.enum(["low", "medium", "high"]),
  related_sample_id: z.coerce.number().optional(),
  related_test_id: z.coerce.number().optional(),
});
type FormData = z.infer<typeof schema>;

const ncStatusVariant: Record<string, "gray" | "warning" | "yellow" | "danger" | "success"> = {
  identified: "warning",
  suspended: "danger",
  under_review: "yellow",
  corrective_action: "yellow",
  closed: "success",
};

export default function NonconformitiesPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: ncs = [], isLoading } = useQuery({
    queryKey: ["nonconformities"],
    queryFn: () => ncApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Nonconformity>) => ncApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nonconformities"] }); setShowCreate(false); },
  });

  const suspendMutation = useMutation({
    mutationFn: (id: number) => ncApi.suspend(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nonconformities"] }),
  });

  const closeMutation = useMutation({
    mutationFn: (id: number) => ncApi.close(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nonconformities"] }),
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({ resolver: zodResolver(schema) });

  const columns = [
    { key: "nc_number", header: "NC #", render: (r: Nonconformity) => <span className="font-mono font-medium text-primary-600">{r.nc_number}</span> },
    { key: "related_sample_id", header: "Sample", render: (r: Nonconformity) => <span className="text-gray-500 text-xs">{r.related_sample_id ? `#${r.related_sample_id}` : "—"}</span> },
    { key: "risk_level", header: "Risk", render: (r: Nonconformity) => <RiskLevelBadge level={r.risk_level} /> },
    { key: "status", header: "Status", render: (r: Nonconformity) => <Badge variant={ncStatusVariant[r.status] ?? "gray"}>{r.status.replace("_", " ")}</Badge> },
    { key: "work_suspended", header: "Suspended", render: (r: Nonconformity) => r.work_suspended ? <span className="text-red-600 font-medium text-xs">YES</span> : <span className="text-gray-400 text-xs">No</span> },
    { key: "identified_at", header: "Identified", render: (r: Nonconformity) => <span className="text-gray-500 text-xs">{format(new Date(r.identified_at), "MMM d, yyyy")}</span> },
    { key: "description", header: "Description", render: (r: Nonconformity) => <span className="max-w-xs truncate block text-sm text-gray-700">{r.description}</span> },
    {
      key: "actions", header: "Actions",
      render: (r: Nonconformity) => (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {!r.work_suspended && r.status !== "closed" && (
            <Button size="sm" variant="danger" onClick={() => suspendMutation.mutate(r.id)} loading={suspendMutation.isPending}>
              <PauseCircle className="w-3.5 h-3.5" /> Suspend
            </Button>
          )}
          {r.status !== "closed" && (
            <Button size="sm" variant="secondary" onClick={() => closeMutation.mutate(r.id)} loading={closeMutation.isPending}>
              <CheckCircle className="w-3.5 h-3.5" /> Close
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout title="Non-Conformities">
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" />Record NC</Button>
        </div>
        <Table columns={columns as never} data={ncs as never} loading={isLoading} emptyMessage="No non-conformities recorded." keyExtractor={(r) => (r as unknown as Nonconformity).id} />
      </div>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); }} title="Record Non-Conformity" size="lg">
        <form onSubmit={handleSubmit(async (data) => {
          const cleaned = { ...data, related_sample_id: data.related_sample_id || undefined, related_test_id: data.related_test_id || undefined };
          await createMutation.mutateAsync(cleaned as Partial<Nonconformity>);
          reset();
        })} className="space-y-4">
          <Textarea label="Description" error={errors.description?.message} {...register("description")} rows={3} placeholder="Describe the non-conformity in detail..." />
          <Select label="Risk Level" error={errors.risk_level?.message} {...register("risk_level")}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Related Sample ID (optional)" type="number" {...register("related_sample_id")} placeholder="Sample ID" />
            <Input label="Related Test ID (optional)" type="number" {...register("related_test_id")} placeholder="Test ID" />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => { setShowCreate(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Record NC</Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
