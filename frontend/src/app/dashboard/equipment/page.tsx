"use client";

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, AlertCircle, Clock, Download, Trash2, CircleCheck, CircleX, TriangleAlert, Pencil } from "lucide-react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { EquipmentStatusBadge } from "@/components/ui/Badge";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { equipmentApi, calibrationApi } from "@/lib/api";
import type { Equipment, CalibrationResult } from "@/lib/types";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// ─── Add equipment schema ─────────────────────────────────────────────────────

const addSchema = z.object({
  equipment_id: z.string().min(1, "Equipment ID is required"),
  name: z.string().min(1, "Name is required"),
  model: z.string().optional(),
  manufacturer: z.string().optional(),
  serial_number: z.string().optional(),
  location: z.string().optional(),
  calibration_due_date: z.string().optional(),
  last_calibration_date: z.string().optional(),
  calibration_certificate_ref: z.string().optional(),
}).refine(
  (d) => !d.last_calibration_date || !d.calibration_due_date || d.calibration_due_date >= d.last_calibration_date,
  { message: "Calibration due date must be after the last calibration date", path: ["calibration_due_date"] }
);
type AddFormData = z.infer<typeof addSchema>;

// ─── Edit equipment schema ────────────────────────────────────────────────────

const editSchema = z.object({
  name: z.string().min(1, "Name is required"),
  model: z.string().optional(),
  manufacturer: z.string().optional(),
  serial_number: z.string().optional(),
  location: z.string().optional(),
  status: z.enum(["active", "in_calibration", "out_of_service", "decommissioned"]).optional(),
  calibration_due_date: z.string().optional(),
  last_calibration_date: z.string().optional(),
  calibration_certificate_ref: z.string().optional(),
}).refine(
  (d) => !d.last_calibration_date || !d.calibration_due_date || d.calibration_due_date >= d.last_calibration_date,
  { message: "Calibration due date must be after the last calibration date", path: ["calibration_due_date"] }
);
type EditFormData = z.infer<typeof editSchema>;

// ─── Add calibration record schema ───────────────────────────────────────────

const calSchema = z.object({
  calibration_date: z.string().min(1, "Calibration date is required"),
  next_due_date: z.string().min(1, "Next due date is required"),
  performed_by: z.string().optional(),
  certificate_ref: z.string().optional(),
  result: z.enum(["pass", "fail", "conditional"]).optional(),
  notes: z.string().optional(),
});
type CalFormData = z.infer<typeof calSchema>;

// ─── Result badge ─────────────────────────────────────────────────────────────

function ResultBadge({ result }: { result?: CalibrationResult }) {
  if (!result) return <span className="text-gray-400 text-xs">—</span>;
  const map = {
    pass: { label: "Pass", icon: CircleCheck, cls: "text-green-700 bg-green-50" },
    fail: { label: "Fail", icon: CircleX, cls: "text-red-700 bg-red-50" },
    conditional: { label: "Conditional", icon: TriangleAlert, cls: "text-yellow-700 bg-yellow-50" },
  } as const;
  const { label, icon: Icon, cls } = map[result];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

// ─── Calibration history modal ────────────────────────────────────────────────

function CalibrationHistoryModal({
  equipment,
  onClose,
}: {
  equipment: Equipment;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["calibration-records", equipment.id],
    queryFn: () => calibrationApi.list(equipment.id).then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (form: FormData) => calibrationApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calibration-records", equipment.id] });
      qc.invalidateQueries({ queryKey: ["equipment"] });
      qc.invalidateQueries({ queryKey: ["equipment-calibration-due"] });
      setShowAddForm(false);
      calReset();
      if (fileRef.current) fileRef.current.value = "";
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => calibrationApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calibration-records", equipment.id] });
      qc.invalidateQueries({ queryKey: ["equipment"] });
    },
  });

  const { register: calReg, handleSubmit: calSubmit, reset: calReset, formState: { errors: calErrors } } =
    useForm<CalFormData>({ resolver: zodResolver(calSchema) });

  function handleCalSubmit(data: CalFormData) {
    const form = new FormData();
    form.append("equipment_id", String(equipment.id));
    form.append("calibration_date", data.calibration_date);
    form.append("next_due_date", data.next_due_date);
    if (data.performed_by) form.append("performed_by", data.performed_by);
    if (data.certificate_ref) form.append("certificate_ref", data.certificate_ref);
    if (data.result) form.append("result", data.result);
    if (data.notes) form.append("notes", data.notes);
    const file = fileRef.current?.files?.[0];
    if (file) form.append("certificate", file);
    createMutation.mutate(form);
  }

  return (
    <div className="space-y-4">
      {/* Equipment summary */}
      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-bold text-primary-600">{equipment.equipment_id}</p>
          <p className="text-sm text-gray-700">{equipment.name}</p>
          {equipment.model && <p className="text-xs text-gray-500">{equipment.manufacturer} · {equipment.model}</p>}
        </div>
        <EquipmentStatusBadge status={equipment.status} />
      </div>

      {/* Add record toggle */}
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-semibold text-gray-700">Calibration History</h4>
        <Button size="sm" onClick={() => setShowAddForm((v) => !v)}>
          <Plus className="w-3.5 h-3.5" />
          {showAddForm ? "Cancel" : "Add Record"}
        </Button>
      </div>

      {/* Add record form */}
      {showAddForm && (
        <form
          onSubmit={calSubmit(handleCalSubmit)}
          className="space-y-3 p-4 border border-blue-200 rounded-lg bg-blue-50"
        >
          <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">New Calibration Record</p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Calibration Date *"
              type="date"
              error={calErrors.calibration_date?.message}
              {...calReg("calibration_date")}
            />
            <Input
              label="Next Due Date *"
              type="date"
              error={calErrors.next_due_date?.message}
              {...calReg("next_due_date")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Performed By" {...calReg("performed_by")} placeholder="Lab / technician name" />
            <Input label="Certificate Ref." {...calReg("certificate_ref")} placeholder="e.g. CERT-2025-001" />
          </div>
          <Select label="Result" {...calReg("result")}>
            <option value="">— Not recorded —</option>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
            <option value="conditional">Conditional</option>
          </Select>
          <Textarea label="Notes" rows={2} {...calReg("notes")} placeholder="Optional notes..." />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Certificate PDF (optional)</label>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-white file:text-primary-700 hover:file:bg-primary-50 file:cursor-pointer border border-gray-300 rounded-lg"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" size="sm" onClick={() => { setShowAddForm(false); calReset(); }}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={createMutation.isPending}>
              Save Record
            </Button>
          </div>
        </form>
      )}

      {/* Records list */}
      {isLoading ? (
        <p className="text-sm text-gray-400 text-center py-4">Loading...</p>
      ) : records.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No calibration records yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r.id} className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg bg-white hover:bg-gray-50">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-800">
                    {format(new Date(r.calibration_date), "dd MMM yyyy")}
                  </span>
                  <ResultBadge result={r.result} />
                  {r.certificate_ref && (
                    <span className="text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                      {r.certificate_ref}
                    </span>
                  )}
                </div>
                {r.performed_by && (
                  <p className="text-xs text-gray-500">By: {r.performed_by}</p>
                )}
                <p className="text-xs text-gray-500">
                  Next due: <span className="font-medium text-gray-700">{format(new Date(r.next_due_date), "dd MMM yyyy")}</span>
                </p>
                {r.notes && <p className="text-xs text-gray-500 italic">{r.notes}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {r.has_certificate && (
                  <a
                    href={calibrationApi.downloadCertUrl(r.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition-colors"
                    title="Download certificate"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                )}
                <button
                  onClick={() => { if (confirm("Delete this calibration record?")) deleteMutation.mutate(r.id); }}
                  className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                  title="Delete record"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EquipmentPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editEquipment, setEditEquipment] = useState<Equipment | null>(null);
  const [historyEquipment, setHistoryEquipment] = useState<Equipment | null>(null);
  const [createError, setCreateError] = useState("");
  const [editError, setEditError] = useState("");

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["equipment"] }); setShowCreate(false); setCreateError(""); reset(); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setCreateError(msg || "Failed to add equipment. Check for duplicate Equipment ID.");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => equipmentApi.toggleActive(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["equipment"] }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Equipment> }) => equipmentApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["equipment"] }); setEditEquipment(null); setEditError(""); editReset(); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setEditError(msg || "Failed to update equipment. Please try again.");
    },
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm<AddFormData>({ resolver: zodResolver(addSchema) });

  const {
    register: editReg,
    handleSubmit: editSubmit,
    reset: editReset,
    formState: { errors: editErrors },
  } = useForm<EditFormData>({ resolver: zodResolver(editSchema) });

  const columns = [
    { key: "equipment_id", header: "Equipment ID", render: (r: Equipment) => <span className="font-mono font-medium text-primary-600">{r.equipment_id}</span> },
    { key: "name", header: "Name" },
    { key: "model", header: "Model", render: (r: Equipment) => <span className="text-gray-600 text-xs">{r.model ?? "—"}</span> },
    { key: "serial_number", header: "Serial #", render: (r: Equipment) => <span className="font-mono text-xs">{r.serial_number ?? "—"}</span> },
    { key: "status", header: "Status", render: (r: Equipment) => <EquipmentStatusBadge status={r.status} /> },
    {
      key: "is_active",
      header: "Active",
      render: (r: Equipment) => (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${r.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {r.is_active ? "Active" : "Inactive"}
        </span>
      ),
    },
    { key: "last_calibration_date", header: "Last Cal.", render: (r: Equipment) => <span className="text-xs text-gray-500">{r.last_calibration_date ? format(new Date(r.last_calibration_date), "MMM d, yyyy") : "—"}</span> },
    {
      key: "calibration_due_date", header: "Due Date", render: (r: Equipment) => {
        if (!r.calibration_due_date) return <span className="text-gray-400">—</span>;
        const due = new Date(r.calibration_due_date);
        const overdue = due < new Date();
        return <span className={`text-xs font-medium ${overdue ? "text-red-600" : "text-gray-700"}`}>{format(due, "MMM d, yyyy")}</span>;
      }
    },
    {
      key: "actions", header: "", render: (r: Equipment) => (
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditEquipment(r);
              editReset({
                name: r.name,
                model: r.model ?? "",
                manufacturer: r.manufacturer ?? "",
                serial_number: r.serial_number ?? "",
                location: r.location ?? "",
                status: r.status,
                calibration_due_date: r.calibration_due_date ?? "",
                last_calibration_date: r.last_calibration_date ?? "",
                calibration_certificate_ref: r.calibration_certificate_ref ?? "",
              });
            }}
            className="flex items-center gap-1 text-xs text-gray-600 hover:text-primary-600 font-medium px-2 py-1 rounded hover:bg-primary-50 transition-colors"
            title="Edit equipment"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); toggleMutation.mutate(r.id); }}
            className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors ${r.is_active ? "text-red-600 hover:bg-red-50" : "text-green-600 hover:bg-green-50"}`}
            title={r.is_active ? "Deactivate" : "Activate"}
          >
            {r.is_active ? <CircleX className="w-3.5 h-3.5" /> : <CircleCheck className="w-3.5 h-3.5" />}
            {r.is_active ? "Deactivate" : "Activate"}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setHistoryEquipment(r); }}
            className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-medium px-2 py-1 rounded hover:bg-primary-50 transition-colors"
            title="View calibration history"
          >
            <Clock className="w-3.5 h-3.5" />
            History
          </button>
        </div>
      )
    },
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

        <Table<Equipment> columns={columns} data={equipment} loading={isLoading} emptyMessage="No equipment registered." keyExtractor={(r) => r.id} />
      </div>

      {/* Add Equipment modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreateError(""); reset(); }} title="Add Equipment" size="lg">
        <form onSubmit={handleSubmit(async (data) => { setCreateError(""); await createMutation.mutateAsync(data as Partial<Equipment>); })} className="space-y-4">
          {createError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded border border-red-200">{createError}</p>}
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
            <Input label="Calibration Due Date" type="date" error={errors.calibration_due_date?.message} {...register("calibration_due_date")} />
          </div>
          <Input label="Calibration Certificate Ref." {...register("calibration_certificate_ref")} placeholder="e.g. CERT-2024-0042" />
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => { setShowCreate(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Add Equipment</Button>
          </div>
        </form>
      </Modal>

      {/* Edit Equipment modal */}
      <Modal
        open={!!editEquipment}
        onClose={() => { setEditEquipment(null); setEditError(""); editReset(); }}
        title={`Edit Equipment — ${editEquipment?.equipment_id ?? ""}`}
        size="lg"
      >
        {editEquipment && (
          <form
            onSubmit={editSubmit((data) => {
              setEditError("");
              updateMutation.mutate({ id: editEquipment.id, data: data as Partial<Equipment> });
            })}
            className="space-y-4"
          >
            {editError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded border border-red-200">{editError}</p>}
            <div className="grid grid-cols-2 gap-4">
              <Input label="Name" error={editErrors.name?.message} {...editReg("name")} placeholder="e.g. pH Meter" />
              <Input label="Manufacturer" {...editReg("manufacturer")} placeholder="e.g. Hach" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Model" {...editReg("model")} placeholder="e.g. HQ40d" />
              <Input label="Serial Number" {...editReg("serial_number")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Location" {...editReg("location")} placeholder="e.g. Lab Room A" />
              <Select label="Status" {...editReg("status")}>
                <option value="active">Active</option>
                <option value="in_calibration">In Calibration</option>
                <option value="out_of_service">Out of Service</option>
                <option value="decommissioned">Decommissioned</option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Last Calibration Date" type="date" {...editReg("last_calibration_date")} />
              <Input label="Calibration Due Date" type="date" error={editErrors.calibration_due_date?.message} {...editReg("calibration_due_date")} />
            </div>
            <Input
              label="Calibration Certificate Ref."
              {...editReg("calibration_certificate_ref")}
              placeholder="e.g. CERT-2024-0042"
            />
            <div className="flex gap-3 justify-end pt-2">
              <Button type="button" variant="secondary" onClick={() => { setEditEquipment(null); editReset(); }}>
                Cancel
              </Button>
              <Button type="submit" loading={updateMutation.isPending}>Save Changes</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Calibration history modal */}
      <Modal
        open={!!historyEquipment}
        onClose={() => setHistoryEquipment(null)}
        title="Calibration History"
        size="lg"
      >
        {historyEquipment && (
          <CalibrationHistoryModal
            equipment={historyEquipment}
            onClose={() => setHistoryEquipment(null)}
          />
        )}
      </Modal>
    </DashboardLayout>
  );
}
