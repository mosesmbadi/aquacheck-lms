"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { apiErrorMessage } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { testCatalogApi, testPackagesApi } from "@/lib/api";
import type { TestCatalogItem, TestCategory, TestPackage } from "@/lib/types";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Plus, Pencil, ToggleLeft, ToggleRight, FlaskConical, Microscope, Droplets, Search, Trash2 } from "lucide-react";

// ─── Form schema ─────────────────────────────────────────────────────────────

const WATER_TYPE_OPTIONS = [
  { value: "dialysis_potable",        label: "Dialysis Water" },
  { value: "potable",                 label: "Potable Water (generic)" },
  { value: "potable_natural",         label: "Natural Potable Water" },
  { value: "potable_treated",         label: "Treated Potable Water" },
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

type WaterTypeFilter = "all" | "dialysis" | "waste_water" | "packaged_drinking_water" | "potable";

const WATER_TYPE_FILTERS: { value: WaterTypeFilter; label: string }[] = [
  { value: "all",                      label: "All Water Types" },
  { value: "dialysis",                 label: "Dialysis Water" },
  { value: "waste_water",              label: "Waste Water" },
  { value: "packaged_drinking_water",  label: "Packaged Drinking Water" },
  { value: "potable",                  label: "Potable Water" },
];

function matchesWaterType(waterType: string | undefined | null, filter: WaterTypeFilter): boolean {
  if (filter === "all") return true;
  const wt = waterType ?? "";
  if (filter === "dialysis")                return wt.startsWith("dialysis");
  if (filter === "waste_water")             return wt.startsWith("waste");
  if (filter === "packaged_drinking_water") return wt === "packaged_drinking_water";
  if (filter === "potable")                 return wt.startsWith("potable");
  return false;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CatalogTestsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<TestCatalogItem | null>(null);
  const [filterCategory, setFilterCategory] = useState<TestCategory | "all">("all");
  const [filterWaterType, setFilterWaterType] = useState<WaterTypeFilter>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [mutationError, setMutationError] = useState("");

  const { data: items = [], isLoading } = useQuery<TestCatalogItem[]>({
    queryKey: ["test-catalog", showInactive],
    queryFn: () =>
      testCatalogApi.list({ active_only: !showInactive }).then((r) => r.data),
  });

  const { data: packages = [] } = useQuery<TestPackage[]>({
    queryKey: ["test-packages"],
    queryFn: () => testPackagesApi.list(false).then((r) => r.data),
  });

  // Map: catalog_item_id → list of package names it belongs to
  const packagesByTestId = new Map<number, string[]>();
  for (const pkg of packages) {
    for (const id of pkg.catalog_item_ids) {
      if (!packagesByTestId.has(id)) packagesByTestId.set(id, []);
      packagesByTestId.get(id)!.push(pkg.name);
    }
  }

  const createMutation = useMutation({
    mutationFn: (data: FormData) => testCatalogApi.create(data as Partial<TestCatalogItem>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["test-catalog"] });
      closeModal();
    },
    onError: (err: unknown) => {
      setMutationError(apiErrorMessage(err, "Failed to save test. You may not have permission."));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormData }) =>
      testCatalogApi.update(id, data as Partial<TestCatalogItem>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["test-catalog"] });
      closeModal();
    },
    onError: (err: unknown) => {
      setMutationError(apiErrorMessage(err, "Failed to save changes. You may not have permission (admin/manager required)."));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (item: TestCatalogItem) =>
      testCatalogApi.update(item.id, { is_active: !item.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["test-catalog"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: number[]) =>
      Promise.all(ids.map((id) => testCatalogApi.delete(id))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["test-catalog"] });
      setSelectedIds(new Set());
      setMutationError("");
    },
    onError: (err: unknown) => {
      setMutationError(apiErrorMessage(err, "Failed to delete. Admin or manager role required."));
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<FormData>({ resolver: zodResolver(schema), mode: "onChange" });

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
    setMutationError("");
    reset();
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll(items: TestCatalogItem[], checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      items.forEach((i) => (checked ? next.add(i.id) : next.delete(i.id)));
      return next;
    });
  }

  async function handleBulkDelete() {
    if (!window.confirm(`Permanently delete ${selectedIds.size} test(s)? This cannot be undone.`)) return;
    await deleteMutation.mutateAsync([...selectedIds]);
  }

  async function onSubmit(data: FormData) {
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, data });
    } else {
      await createMutation.mutateAsync(data);
    }
  }

  const searchLower = searchQuery.toLowerCase();
  const filtered = items
    .filter((i) => filterCategory === "all" || i.category === filterCategory)
    .filter((i) => matchesWaterType(i.water_type, filterWaterType))
    .filter(
      (i) =>
        !searchQuery ||
        i.name.toLowerCase().includes(searchLower) ||
        (i.unit ?? "").toLowerCase().includes(searchLower) ||
        (i.method_name ?? "").toLowerCase().includes(searchLower) ||
        (i.standard_limit ?? "").toLowerCase().includes(searchLower)
    );

  const physioItems = filtered.filter((i) => i.category === "physicochemical");
  const microItems = filtered.filter((i) => i.category === "microbiological");

  const loading = createMutation.isPending || updateMutation.isPending;

  return (
    <DashboardLayout title="Test Catalog">
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500 shrink-0">
          Water quality tests (ISO / AAMI / Kenya standards) — {items.length} entries
        </p>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search tests…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
        <Button onClick={openCreate} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" /> Add Test
        </Button>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        {/* Water type filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <Droplets className="w-4 h-4 text-gray-400 shrink-0" />
          {WATER_TYPE_FILTERS.map((wt) => (
            <button
              key={wt.value}
              onClick={() => setFilterWaterType(wt.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                filterWaterType === wt.value
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-teal-400"
              }`}
            >
              {wt.label}
            </button>
          ))}
        </div>

        {/* Category filter */}
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
      </div>

      {/* Error banner */}
      {mutationError && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg">
          <span className="text-sm text-red-700">{mutationError}</span>
          <button onClick={() => setMutationError("")} className="text-red-400 hover:text-red-600 text-xs ml-4">Dismiss</button>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg">
          <span className="text-sm font-medium text-red-700">
            {selectedIds.size} test{selectedIds.size > 1 ? "s" : ""} selected
          </span>
          <Button
            variant="danger"
            size="sm"
            className="gap-1.5 ml-auto"
            onClick={handleBulkDelete}
            loading={deleteMutation.isPending}
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete Selected
          </Button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        </div>
      )}

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
                <TestTable
                  items={physioItems}
                  onEdit={openEdit}
                  onToggle={(i) => toggleMutation.mutate(i)}
                  selectedIds={selectedIds}
                  onSelect={toggleSelect}
                  onSelectAll={(checked) => toggleSelectAll(physioItems, checked)}
                  packagesByTestId={packagesByTestId}
                />
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
                <TestTable
                  items={microItems}
                  onEdit={openEdit}
                  onToggle={(i) => toggleMutation.mutate(i)}
                  selectedIds={selectedIds}
                  onSelect={toggleSelect}
                  onSelectAll={(checked) => toggleSelectAll(microItems, checked)}
                  packagesByTestId={packagesByTestId}
                />
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
          {mutationError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded border border-red-200">{mutationError}</p>
          )}
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
            <Button type="submit" loading={loading} disabled={!isValid}>{editing ? "Save Changes" : "Add Test"}</Button>
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
  selectedIds,
  onSelect,
  onSelectAll,
  packagesByTestId,
}: {
  items: TestCatalogItem[];
  onEdit: (item: TestCatalogItem) => void;
  onToggle: (item: TestCatalogItem) => void;
  selectedIds: Set<number>;
  onSelect: (id: number, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  packagesByTestId: Map<number, string[]>;
}) {
  const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));
  const someSelected = !allSelected && items.some((i) => selectedIds.has(i.id));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left">
            <th className="px-4 py-3 w-8">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={(e) => onSelectAll(e.target.checked)}
                className="rounded border-gray-300"
              />
            </th>
            <th className="px-5 py-3 font-medium text-gray-500 w-8">#</th>
            <th className="px-5 py-3 font-medium text-gray-500">Test / Parameter</th>
            <th className="px-5 py-3 font-medium text-gray-500">Unit</th>
            <th className="px-5 py-3 font-medium text-gray-500">Method</th>
            <th className="px-5 py-3 font-medium text-gray-500">Standard Limit</th>
            <th className="px-5 py-3 font-medium text-gray-500">Packages</th>
            <th className="px-5 py-3 font-medium text-gray-500 text-center">Status</th>
            <th className="px-5 py-3 font-medium text-gray-500 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const isSelected = selectedIds.has(item.id);
            const pkgNames = packagesByTestId.get(item.id) ?? [];
            return (
              <tr
                key={item.id}
                className={`border-b border-gray-50 hover:bg-gray-50/50 ${isSelected ? "bg-red-50/40" : ""}`}
              >
                <td className="px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelect(item.id, e.target.checked)}
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="px-5 py-2.5 text-gray-400 text-xs">{idx + 1}</td>
                <td className="px-5 py-2.5 font-medium text-gray-800">{item.name}</td>
                <td className="px-5 py-2.5 text-gray-500">{item.unit || "—"}</td>
                <td className="px-5 py-2.5 text-gray-500 text-xs">{item.method_name || "—"}</td>
                <td className="px-5 py-2.5 text-gray-600">{item.standard_limit || "—"}</td>
                <td className="px-5 py-2.5">
                  {pkgNames.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {pkgNames.map((name) => (
                        <span
                          key={name}
                          className="text-[10px] px-1.5 py-0.5 bg-primary-50 text-primary-700 border border-primary-200 rounded-full font-medium"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
