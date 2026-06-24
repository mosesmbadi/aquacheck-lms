"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Package, FlaskConical, Microscope } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { testPackagesApi, testCatalogApi } from "@/lib/api";
import type { TestPackage, TestCatalogItem } from "@/lib/types";
import { apiErrorMessage } from "@/lib/utils";

export default function CatalogPackagesPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<TestPackage | null>(null);
  const [error, setError] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: packages = [], isLoading } = useQuery({
    queryKey: ["test-packages"],
    queryFn: () => testPackagesApi.list(false).then((r) => r.data),
  });

  const { data: catalog = [] } = useQuery<TestCatalogItem[]>({
    queryKey: ["test-catalog"],
    queryFn: () => testCatalogApi.list({ active_only: true }).then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      testPackagesApi.create({
        name: name.trim(),
        description: description.trim() || undefined,
        price: Number(price),
        catalog_item_ids: [...selectedIds],
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["test-packages"] }); closeModal(); },
    onError: (e) => setError(apiErrorMessage(e, "Failed to create package.")),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      testPackagesApi.update(editing!.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        price: Number(price),
        catalog_item_ids: [...selectedIds],
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["test-packages"] }); closeModal(); },
    onError: (e) => setError(apiErrorMessage(e, "Failed to update package.")),
  });

  const toggleMutation = useMutation({
    mutationFn: (pkg: TestPackage) =>
      testPackagesApi.update(pkg.id, { is_active: !pkg.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["test-packages"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => testPackagesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["test-packages"] }),
    onError: (e) => alert(apiErrorMessage(e, "Failed to delete package.")),
  });

  function openCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    setPrice("");
    setSelectedIds(new Set());
    setError("");
    setShowModal(true);
  }

  function openEdit(pkg: TestPackage) {
    setEditing(pkg);
    setName(pkg.name);
    setDescription(pkg.description ?? "");
    setPrice(String(pkg.price));
    setSelectedIds(new Set(pkg.catalog_item_ids));
    setError("");
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
    setError("");
  }

  function toggleTest(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const isFormValid = name.trim().length > 0 && Number(price) >= 0 && selectedIds.size > 0;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const physio = catalog.filter((c) => c.category === "physicochemical");
  const micro = catalog.filter((c) => c.category === "microbiological");

  return (
    <DashboardLayout title="Test Packages">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Bundle tests into priced packages for quoting. Individual test results are still recorded separately.
          </p>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" /> New Package
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading packages…</div>
        ) : packages.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No packages defined yet.</p>
            <p className="text-xs mt-1">Create a package to bundle tests with a single price for quotations.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {packages.map((pkg) => (
              <Card key={pkg.id} className={!pkg.is_active ? "opacity-60" : ""}>
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 truncate">{pkg.name}</h3>
                        <Badge variant={pkg.is_active ? "success" : "gray"}>
                          {pkg.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      {pkg.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{pkg.description}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-bold text-primary-600">
                        KES {Number(pkg.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-[10px] text-gray-400">package price</p>
                    </div>
                  </div>

                  {/* Tests included */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                      {pkg.items.length} test{pkg.items.length !== 1 ? "s" : ""} included
                    </p>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                      {pkg.items.map((it) => (
                        <span
                          key={it.id}
                          className={`text-[10px] px-1.5 py-0.5 rounded border ${
                            it.catalog_item_category === "microbiological"
                              ? "bg-green-50 border-green-200 text-green-700"
                              : "bg-blue-50 border-blue-200 text-blue-700"
                          }`}
                        >
                          {it.catalog_item_name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 pt-1 border-t border-gray-100">
                    <button
                      onClick={() => openEdit(pkg)}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary-600 px-2 py-1 rounded hover:bg-primary-50"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate(pkg)}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${
                        pkg.is_active
                          ? "text-amber-600 hover:bg-amber-50"
                          : "text-green-600 hover:bg-green-50"
                      }`}
                    >
                      {pkg.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete package "${pkg.name}"? This cannot be undone.`))
                          deleteMutation.mutate(pkg.id);
                      }}
                      className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 ml-auto"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      <Modal
        open={showModal}
        onClose={closeModal}
        title={editing ? `Edit Package — ${editing.name}` : "New Test Package"}
        size="xl"
      >
        <div className="space-y-5">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded border border-red-200">{error}</p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Package Name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard Water Analysis"
            />
            <Input
              label="Package Price (KES) *"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g. 8000"
            />
          </div>

          <Textarea
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Brief description of what this package covers…"
          />

          {/* Test selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Tests included in this package *
              </label>
              {selectedIds.size > 0 && (
                <span className="text-xs text-primary-600 font-medium bg-primary-50 px-2 py-0.5 rounded-full">
                  {selectedIds.size} selected
                </span>
              )}
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {/* Physicochemical */}
              {physio.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-gray-200">
                    <FlaskConical className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-xs font-semibold text-blue-800 uppercase tracking-wide">
                      Physio-Chemical
                    </span>
                    <label className="ml-auto flex items-center gap-1.5 text-xs text-blue-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={physio.every((i) => selectedIds.has(i.id))}
                        onChange={(e) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            physio.forEach((i) => e.target.checked ? next.add(i.id) : next.delete(i.id));
                            return next;
                          });
                        }}
                        className="rounded border-blue-300"
                      />
                      Select all
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-0">
                    {physio.map((item) => (
                      <label
                        key={item.id}
                        className="flex items-start gap-2 px-3 py-1.5 cursor-pointer border-b border-gray-50 hover:bg-gray-50 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleTest(item.id)}
                          className="mt-0.5 rounded border-gray-300 flex-shrink-0"
                        />
                        <span className="text-gray-700 leading-tight">{item.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Microbiological */}
              {micro.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border-b border-gray-200">
                    <Microscope className="w-3.5 h-3.5 text-green-600" />
                    <span className="text-xs font-semibold text-green-800 uppercase tracking-wide">
                      Microbiological
                    </span>
                    <label className="ml-auto flex items-center gap-1.5 text-xs text-green-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={micro.every((i) => selectedIds.has(i.id))}
                        onChange={(e) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            micro.forEach((i) => e.target.checked ? next.add(i.id) : next.delete(i.id));
                            return next;
                          });
                        }}
                        className="rounded border-green-300"
                      />
                      Select all
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-0">
                    {micro.map((item) => (
                      <label
                        key={item.id}
                        className="flex items-start gap-2 px-3 py-1.5 cursor-pointer border-b border-gray-50 hover:bg-gray-50 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleTest(item.id)}
                          className="mt-0.5 rounded border-gray-300 flex-shrink-0"
                        />
                        <span className="text-gray-700 leading-tight">{item.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {selectedIds.size === 0 && (
              <p className="text-xs text-red-500 mt-1">Select at least one test to include in the package.</p>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-2 border-t">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button
              onClick={() => editing ? updateMutation.mutate() : createMutation.mutate()}
              loading={isPending}
              disabled={!isFormValid}
            >
              {editing ? "Save Changes" : "Create Package"}
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
