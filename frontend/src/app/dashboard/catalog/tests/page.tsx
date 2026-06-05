"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { testCatalogApi } from "@/lib/api";
import type { TestCatalogItem, TestCategory } from "@/lib/types";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Plus, Pencil, ToggleLeft, ToggleRight, FlaskConical, Microscope } from "lucide-react";

// ─── Form schema ─────────────────────────────────────────────────────────────

const WATER_TYPE_OPTIONS = [
  { value: "dialysis_potable",        label: "Dialysis Water" },
  { value: "potable",                 label: "Potable Water (KS 459)" },
  { value: "packaged_drinking_water", label: "Packaged Drinking Water" },
  { value: "waste_1",                 label: "Waste Water (Schedule 1)" },
  { value: "waste_2",                 label: "Waste Water (Schedule 2)" },
  { value: "waste_3",                 label: "Waste Water (Schedule 3)" },
  { value: "waste_4",                 label: "Waste Water (Schedule 4)" },
  { value: "waste_5",                 label: "Waste Water (Schedule 5)" },
  { value: "waste_6",                 label: "Waste Water (Schedule 6)" },
] as const;

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.enum(["physicochemical", "microbiological"]),
  water_type: z.string().default("dialysis_potable"),
  unit: z.string().optional(),
  method_name: z.string().optional(),
  standard_limit: z.string().optional(),
  description: z.string().optional(),
  price: z.coerce.number().min(0).default(0),
  sort_order: z.coerce.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});
type FormData = z.infer<typeof schema>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<TestCategory, string> = {
  physicochemical: "Physio-Chemical",
  microbiological: "Microbiological",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CatalogTestsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<TestCatalogItem | null>(null);
  const [filterCategory, setFilterCategory] = useState<TestCategory | "all">("all");
  const [showInactive, setShowInactive] = useState(false);

  const { data: items = [], isLoading } = useQuery<TestCatalogItem[]>({
    queryKey: ["test-catalog", showInactive],
    queryFn: () =>
      testCatalogApi.list({ active_only: !showInactive }).then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: FormData) => testCatalogApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["test-catalog"] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormData }) =>
      testCatalogApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["test-catalog"] });
      closeModal();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (item: TestCatalogItem) =>
      testCatalogApi.update(item.id, { is_active: !item.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["test-catalog"] }),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  function openCreate() {
    reset({ category: "physicochemical", water_type: "dialysis_potable", sort_order: 0, is_active: true, price: 0 });
    setEditing(null);
    setShowModal(true);
  }

  function openEdit(item: TestCatalogItem) {
    reset({
      name: item.name,
      category: item.category,
      water_type: item.water_type ?? "dialysis_potable",
      unit: item.unit ?? "",
      method_name: item.method_name ?? "",
      standard_limit: item.standard_limit ?? "",
      description: item.description ?? "",
      price: item.price ?? 0,
      sort_order: item.sort_order,
      is_active: item.is_active,
    });
    setEditing(item);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
    reset();
  }

  async function onSubmit(data: FormData) {
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, data });
    } else {
      await createMutation.mutateAsync(data);
    }
  }

  const filtered =
    filterCategory === "all"
      ? items
      : items.filter((i) => i.category === filterCategory);

  const physioItems = filtered.filter((i) => i.category === "physicochemical");
  const microItems = filtered.filter((i) => i.category === "microbiological");

  const loading = createMutation.isPending || updateMutation.isPending;

  return (
    <DashboardLayout title="Test Catalog">
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 mt-0.5">
            Dialysis water tests (ISO 23500 / AAMI / Kenya standards) — {items.length} entries
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> Add Test
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {(["all", "physicochemical", "microbiological"] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              filterCategory === cat
                ? "bg-primary-500 text-white border-primary-500"
                : "bg-white text-gray-600 border-gray-200 hover:border-primary-300"
            }`}
          >
            {cat === "all" ? "All Tests" : CATEGORY_LABELS[cat]}
          </button>
        ))}
        <label className="flex items-center gap-2 ml-auto text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-gray-300"
          />
          Show inactive
        </label>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading catalog…</div>
      ) : (
        <div className="space-y-6">
          {/* Physicochemical */}
          {(filterCategory === "all" || filterCategory === "physicochemical") &&
            physioItems.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-blue-50 rounded-t-xl">
                  <FlaskConical className="w-4 h-4 text-blue-600" />
                  <h2 className="font-semibold text-blue-800">Physio-Chemical Tests</h2>
                  <span className="ml-auto text-xs text-blue-500">{physioItems.length} tests</span>
                </div>
                <TestTable items={physioItems} onEdit={openEdit} onToggle={(i) => toggleMutation.mutate(i)} />
              </Card>
            )}

          {/* Microbiological */}
          {(filterCategory === "all" || filterCategory === "microbiological") &&
            microItems.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-green-50 rounded-t-xl">
                  <Microscope className="w-4 h-4 text-green-600" />
                  <h2 className="font-semibold text-green-800">Microbiological Tests</h2>
                  <span className="ml-auto text-xs text-green-500">{microItems.length} tests</span>
                </div>
                <TestTable items={microItems} onEdit={openEdit} onToggle={(i) => toggleMutation.mutate(i)} />
              </Card>
            )}

          {filtered.length === 0 && (
            <div className="text-center py-16 text-gray-400">No tests found.</div>
          )}
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal
        open={showModal}
        onClose={closeModal}
        title={editing ? "Edit Catalog Test" : "Add Catalog Test"}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Test Name" error={errors.name?.message} {...register("name")} placeholder="e.g. Fluoride as F mg/L" />

          <div className="grid grid-cols-2 gap-4">
            <Select label="Category" error={errors.category?.message} {...register("category")}>
              <option value="physicochemical">Physio-Chemical</option>
              <option value="microbiological">Microbiological</option>
            </Select>
            <Select label="Water Type" error={errors.water_type?.message} {...register("water_type")}>
              {WATER_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Unit" error={errors.unit?.message} {...register("unit")} placeholder="e.g. mg/L, µg/L, CFU/mL" />
            <Input label="Price (KES)" type="number" step="0.01" error={errors.price?.message} {...register("price")} placeholder="0.00" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Method" error={errors.method_name?.message} {...register("method_name")} placeholder="e.g. APHA Method: 4500" />
            <Input label="Standard Limit" error={errors.standard_limit?.message} {...register("standard_limit")} placeholder="e.g. 0.2, Not Detectable" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Sort Order" type="number" error={errors.sort_order?.message} {...register("sort_order")} />
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" id="is_active" {...register("is_active")} className="rounded border-gray-300" />
              <label htmlFor="is_active" className="text-sm text-gray-700">Active</label>
            </div>
          </div>

          <Textarea label="Description (optional)" {...register("description")} rows={2} placeholder="Additional notes…" />

          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button type="submit" loading={loading}>{editing ? "Save Changes" : "Add Test"}</Button>
          </div>
        </form>
      </Modal>
    </div>
    </DashboardLayout>
  );
}

// ─── Sub-component ────────────────────────────────────────────────────────────

function TestTable({
  items,
  onEdit,
  onToggle,
}: {
  items: TestCatalogItem[];
  onEdit: (item: TestCatalogItem) => void;
  onToggle: (item: TestCatalogItem) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left">
            <th className="px-5 py-3 font-medium text-gray-500 w-8">#</th>
            <th className="px-5 py-3 font-medium text-gray-500">Test / Parameter</th>
            <th className="px-5 py-3 font-medium text-gray-500">Unit</th>
            <th className="px-5 py-3 font-medium text-gray-500">Method</th>
            <th className="px-5 py-3 font-medium text-gray-500">Standard Limit</th>
            <th className="px-5 py-3 font-medium text-gray-500 text-center">Status</th>
            <th className="px-5 py-3 font-medium text-gray-500 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/50">
              <td className="px-5 py-2.5 text-gray-400 text-xs">{idx + 1}</td>
              <td className="px-5 py-2.5 font-medium text-gray-800">{item.name}</td>
              <td className="px-5 py-2.5 text-gray-500">{item.unit || "—"}</td>
              <td className="px-5 py-2.5 text-gray-500 text-xs">{item.method_name || "—"}</td>
              <td className="px-5 py-2.5 text-gray-600">{item.standard_limit || "—"}</td>
              <td className="px-5 py-2.5 text-center">
                <Badge variant={item.is_active ? "success" : "gray"}>
                  {item.is_active ? "Active" : "Inactive"}
                </Badge>
              </td>
              <td className="px-5 py-2.5 text-right">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => onEdit(item)}
                    className="p-1.5 text-gray-400 hover:text-gray-700 rounded"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onToggle(item)}
                    className={`p-1.5 rounded ${item.is_active ? "text-green-500 hover:text-red-400" : "text-gray-400 hover:text-green-500"}`}
                    title={item.is_active ? "Deactivate" : "Activate"}
                  >
                    {item.is_active ? (
                      <ToggleRight className="w-4 h-4" />
                    ) : (
                      <ToggleLeft className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
