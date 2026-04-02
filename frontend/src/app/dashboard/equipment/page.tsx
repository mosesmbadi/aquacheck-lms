"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { EquipmentStatusBadge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { equipmentApi } from "@/lib/api";
import type { Equipment } from "@/lib/types";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  equipment_id: z.string().min(1, "Equipment ID is required"),
  name: z.string().min(1, "Name is required"),
  model: z.string().optional(),
  manufacturer: z.string().optional(),
  serial_number: z.string().optional(),
  location: z.string().optional(),
  calibration_due_date: z.string().optional(),
  last_calibration_date: z.string().optional(),
  calibration_certificate_ref: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function EquipmentPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ["equipment"],
    queryFn: () => equipmentApi.list().then((r) => r.data),
  });
  const { data: calDue = [] } = useQuery({
    queryKey: ["equipment-calibration-due"],
    queryFn: () => equipmentApi.calibrationDue().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Equipment>) => equipmentApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["equipment"] }); setShowCreate(false); },
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({ resolver: zodResolver(schema) });

  const columns = [
    { key: "equipment_id", header: "Equipment ID", render: (r: Equipment) => <span className="font-mono font-medium text-primary-600">{r.equipment_id}</span> },
    { key: "name", header: "Name" },
    { key: "model", header: "Model", render: (r: Equipment) => <span className="text-gray-600 text-xs">{r.model ?? "—"}</span> },
    { key: "serial_number", header: "Serial #", render: (r: Equipment) => <span className="font-mono text-xs">{r.serial_number ?? "—"}</span> },
    { key: "status", header: "Status", render: (r: Equipment) => <EquipmentStatusBadge status={r.status} /> },
    { key: "last_calibration_date", header: "Last Cal.", render: (r: Equipment) => <span className="text-xs text-gray-500">{r.last_calibration_date ? format(new Date(r.last_calibration_date), "MMM d, yyyy") : "—"}</span> },
    { key: "calibration_due_date", header: "Due Date", render: (r: Equipment) => {
      if (!r.calibration_due_date) return <span className="text-gray-400">—</span>;
      const due = new Date(r.calibration_due_date);
      const overdue = due < new Date();
      return <span className={`text-xs font-medium ${overdue ? "text-red-600" : "text-gray-700"}`}>{format(due, "MMM d, yyyy")}</span>;
    }},
  ];

  return (
    <DashboardLayout title="Equipment">
      <div className="space-y-4">
        {calDue.length > 0 && (
          <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-800 text-sm">Calibration Due Soon</p>
              <p className="text-yellow-700 text-xs mt-0.5">
                {calDue.length} equipment item{calDue.length !== 1 ? "s" : ""} have calibration due within 30 days:{" "}
                {calDue.map((e) => e.equipment_id).join(", ")}
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" />Add Equipment</Button>
        </div>

        <Table columns={columns as never} data={equipment as never} loading={isLoading} emptyMessage="No equipment registered." keyExtractor={(r) => (r as unknown as Equipment).id} />
      </div>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); }} title="Add Equipment" size="lg">
        <form onSubmit={handleSubmit(async (data) => { await createMutation.mutateAsync(data as Partial<Equipment>); reset(); })} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Equipment ID" error={errors.equipment_id?.message} {...register("equipment_id")} placeholder="e.g. EQ-001" />
            <Input label="Name" error={errors.name?.message} {...register("name")} placeholder="e.g. pH Meter" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Manufacturer" {...register("manufacturer")} placeholder="e.g. Hach" />
            <Input label="Model" {...register("model")} placeholder="e.g. HQ40d" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Serial Number" {...register("serial_number")} />
            <Input label="Location" {...register("location")} placeholder="e.g. Lab Room A" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Last Calibration Date" type="date" {...register("last_calibration_date")} />
            <Input label="Calibration Due Date" type="date" {...register("calibration_due_date")} />
          </div>
          <Input label="Calibration Certificate Ref." {...register("calibration_certificate_ref")} placeholder="e.g. CERT-2024-0042" />
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => { setShowCreate(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Add Equipment</Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
