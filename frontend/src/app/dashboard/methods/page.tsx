"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { MethodStatusBadge } from "@/components/ui/Badge";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { methodsApi } from "@/lib/api";
import type { Method } from "@/lib/types";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(2, "Name is required"),
  standard_reference: z.string().optional(),
  version: z.string().default("1.0"),
  description: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function MethodsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");

  const { data: methods = [], isLoading } = useQuery({
    queryKey: ["methods"],
    queryFn: () => methodsApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Method>) => methodsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["methods"] }); setShowCreate(false); },
  });

  const validateMutation = useMutation({
    mutationFn: (id: number) => methodsApi.validate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["methods"] }),
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({ resolver: zodResolver(schema) });

  const filtered = methods.filter((m) =>
    !search || m.code.toLowerCase().includes(search.toLowerCase()) || m.name.toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    { key: "code", header: "Code", render: (r: Method) => <span className="font-mono font-medium text-primary-600">{r.code}</span> },
    { key: "name", header: "Name" },
    { key: "standard_reference", header: "Standard Ref.", render: (r: Method) => <span className="text-gray-600 text-xs">{r.standard_reference ?? "—"}</span> },
    { key: "version", header: "Version", render: (r: Method) => <span className="text-gray-600">v{r.version}</span> },
    { key: "status", header: "Status", render: (r: Method) => <MethodStatusBadge status={r.status} /> },
    { key: "validation_date", header: "Validated", render: (r: Method) => <span className="text-gray-500 text-xs">{r.validation_date ? format(new Date(r.validation_date), "MMM d, yyyy") : "—"}</span> },
    {
      key: "actions", header: "Actions",
      render: (r: Method) => (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {r.status !== "validated" && (
            <Button size="sm" variant="secondary" onClick={() => validateMutation.mutate(r.id)} loading={validateMutation.isPending}>
              <CheckCircle className="w-3.5 h-3.5" /> Validate
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout title="Test Methods">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search methods..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none" />
          </div>
          <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" />Add Method</Button>
        </div>
        <Table columns={columns as never} data={filtered as never} loading={isLoading} emptyMessage="No methods defined." keyExtractor={(r) => (r as unknown as Method).id} />
      </div>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); }} title="Add Test Method" size="lg">
        <form onSubmit={handleSubmit(async (data) => { await createMutation.mutateAsync(data as Partial<Method>); reset(); })} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Method Code" error={errors.code?.message} {...register("code")} placeholder="e.g. METH-001" />
            <Input label="Version" error={errors.version?.message} {...register("version")} placeholder="1.0" />
          </div>
          <Input label="Method Name" error={errors.name?.message} {...register("name")} placeholder="e.g. Turbidity Analysis" />
          <Input label="Standard Reference" {...register("standard_reference")} placeholder="e.g. ISO 7027, APHA 2130 B" />
          <Textarea label="Description" {...register("description")} rows={3} placeholder="Describe the method..." />
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => { setShowCreate(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Add Method</Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
