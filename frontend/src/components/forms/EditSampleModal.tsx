"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Microscope, Search, AlertCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { samplesApi } from "@/lib/api";
import { apiErrorMessage } from "@/lib/utils";
import type { Sample, TestCatalogItem, TestResult, User, WaterType } from "@/lib/types";

// The catalog a sample with no tests picked yet draws from, by category.
const CATEGORY_WATER_TYPES: Record<string, WaterType[]> = {
  dialysis: ["dialysis_potable"],
  potable: ["potable_natural", "potable_treated", "potable"],
  packaged_drinking_water: ["packaged_drinking_water"],
  paint: ["paint"],
  swimming_pool: ["swimming_pool"],
};

function wasteWaterTypes(sample: Sample): WaterType[] {
  if (sample.waste_schedule) return [`waste_${sample.waste_schedule}` as WaterType];
  return ["waste_3", "waste_5"];
}

type Details = {
  sample_type: string;
  physical_sample_id: string;
  description: string;
  notes: string;
  submitted_by: string;
  contact_person: string;
  sampled_by: string;
  collection_date: string;
  collection_location: string;
  gps_coordinates: string;
  storage_condition: string;
  subcontractor_name: string;
};

/**
 * Correct a registered sample: its details, and the tests requested for it. A test with a
 * validated result can't be removed, and nothing changes once the report is issued —
 * the server enforces both.
 */
export function EditSampleModal({
  sample,
  catalogItems,
  testResults,
  staffUsers,
  onClose,
}: {
  sample: Sample;
  /** The whole catalog, inactive tests included. */
  catalogItems: TestCatalogItem[];
  testResults: TestResult[];
  staffUsers: User[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [details, setDetails] = useState<Details>({
    sample_type: sample.sample_type ?? "",
    physical_sample_id: sample.physical_sample_id ?? "",
    description: sample.description ?? "",
    notes: sample.notes ?? "",
    submitted_by: sample.submitted_by ?? "",
    contact_person: sample.contact_person ?? "",
    sampled_by: sample.sampled_by ? String(sample.sampled_by) : "",
    collection_date: sample.collection_date?.slice(0, 10) ?? "",
    collection_location: sample.collection_location ?? "",
    gps_coordinates: sample.gps_coordinates ?? "",
    storage_condition: sample.storage_condition ?? "",
    subcontractor_name: sample.subcontractor_name ?? "",
  });
  const originalTests = sample.requested_test_ids ?? [];
  const [selected, setSelected] = useState<number[]>(originalTests);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof Details) => (e: { target: { value: string } }) =>
    setDetails((d) => ({ ...d, [field]: e.target.value }));

  const resultByCatalog = useMemo(() => {
    const map = new Map<number, TestResult>();
    for (const r of testResults) if (r.catalog_item_id) map.set(r.catalog_item_id, r);
    return map;
  }, [testResults]);

  // Offer the catalog the sample's tests come from: the water types of the tests already
  // picked, or the sample category's when none are.
  const offered = useMemo(() => {
    const byId = new Map(catalogItems.map((c) => [c.id, c]));
    const fromTests = new Set(
      originalTests.map((id) => byId.get(id)?.water_type).filter(Boolean) as WaterType[]
    );
    const waterTypes = fromTests.size > 0
      ? fromTests
      : new Set(
          sample.sample_category === "waste"
            ? wasteWaterTypes(sample)
            : CATEGORY_WATER_TYPES[sample.sample_category ?? ""] ?? []
        );
    return catalogItems.filter(
      (c) => selected.includes(c.id) || (c.is_active && waterTypes.has(c.water_type))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogItems, sample]);

  const needle = search.trim().toLowerCase();
  const visible = needle ? offered.filter((c) => c.name.toLowerCase().includes(needle)) : offered;
  const groups = [
    { title: "Physio-Chemical", icon: FlaskConical, tone: "blue", items: visible.filter((c) => c.category === "physicochemical") },
    { title: "Microbiological", icon: Microscope, tone: "green", items: visible.filter((c) => c.category !== "physicochemical") },
  ];

  const isLocked = (id: number) => resultByCatalog.get(id)?.status === "validated";

  function toggle(id: number) {
    if (isLocked(id) && selected.includes(id)) return;
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  const added = selected.filter((id) => !originalTests.includes(id));
  const removed = originalTests.filter((id) => !selected.includes(id));
  const testsChanged = added.length > 0 || removed.length > 0;
  const removedWithResults = removed.filter((id) => resultByCatalog.get(id)?.result_value);

  const saveMutation = useMutation({
    mutationFn: () => {
      const clean = (v: string) => v.trim() || null;
      return samplesApi.update(sample.id, {
        sample_type: clean(details.sample_type),
        physical_sample_id: clean(details.physical_sample_id),
        description: clean(details.description),
        notes: clean(details.notes),
        submitted_by: clean(details.submitted_by),
        contact_person: clean(details.contact_person),
        sampled_by: details.sampled_by ? Number(details.sampled_by) : null,
        collection_date: details.collection_date || null,
        collection_location: clean(details.collection_location),
        gps_coordinates: clean(details.gps_coordinates),
        storage_condition: clean(details.storage_condition),
        subcontractor_name: clean(details.subcontractor_name),
        ...(testsChanged ? { requested_test_ids: selected } : {}),
      } as unknown as Partial<Sample>);
    },
    onMutate: () => setError(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sample", sample.id] });
      qc.invalidateQueries({ queryKey: ["samples"] });
      qc.invalidateQueries({ queryKey: ["test-results", { sample_id: sample.id }] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err, "Could not save the sample.")),
  });

  function handleSave() {
    if (selected.length === 0 && originalTests.length > 0) {
      setError("A sample needs at least one test.");
      return;
    }
    if (removedWithResults.length > 0) {
      const names = removedWithResults.map((id) => catalogItems.find((c) => c.id === id)?.name ?? `#${id}`);
      if (!window.confirm(`These tests already have results entered, which will no longer appear on the report:\n\n${names.join("\n")}\n\nRemove them anyway?`)) {
        return;
      }
    }
    saveMutation.mutate();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit Sample ${sample.sample_code}`}
      size="xl"
      footer={
        <div className="flex items-center justify-end gap-3">
          {testsChanged && (
            <span className="mr-auto text-xs text-amber-700">
              {added.length > 0 && `${added.length} test${added.length === 1 ? "" : "s"} added`}
              {added.length > 0 && removed.length > 0 && " · "}
              {removed.length > 0 && `${removed.length} removed`}
            </span>
          )}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saveMutation.isPending}>Save Changes</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Sample Type / Brief Label" value={details.sample_type} onChange={set("sample_type")} />
          <Input label="Physical Sample ID" value={details.physical_sample_id} onChange={set("physical_sample_id")} />
        </div>
        <Textarea label="Sample Description (shown on report)" rows={2} value={details.description} onChange={set("description")} />
        <Textarea label="Notes (shown separately on report)" rows={2} value={details.notes} onChange={set("notes")} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Submitted By" value={details.submitted_by} onChange={set("submitted_by")} />
          <Input label="Contact Person" value={details.contact_person} onChange={set("contact_person")} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Sampled By" value={details.sampled_by} onChange={set("sampled_by")}>
            <option value="">— Leave blank (defaults to AquaCheck Laboratories Ltd) —</option>
            {staffUsers.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </Select>
          <Input label="Collection Date" type="date" value={details.collection_date} onChange={set("collection_date")} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Collection Location" value={details.collection_location} onChange={set("collection_location")} />
          <Input label="GPS Coordinates" value={details.gps_coordinates} onChange={set("gps_coordinates")} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Storage Condition" value={details.storage_condition} onChange={set("storage_condition")} />
          {(sample.subcontracted_test_ids ?? []).length > 0 && (
            <Input label="Subcontractor" value={details.subcontractor_name} onChange={set("subcontractor_name")} />
          )}
        </div>

        {/* Tests */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label className="block text-sm font-medium text-gray-700">
              Tests to be Performed
              <span className="ml-2 text-xs text-primary-600 font-medium bg-primary-50 px-2 py-0.5 rounded-full">
                {selected.length} selected
              </span>
            </label>
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a test…"
                className="w-full pl-8 pr-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Untick a test to remove it from this sample, or tick one to add it. Tests with a validated result are locked.
          </p>
          {groups.map(({ title, icon: Icon, tone, items }) =>
            items.length === 0 ? null : (
              <div key={title} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className={`flex items-center gap-2 px-3 py-2 border-b border-gray-200 ${tone === "blue" ? "bg-blue-50" : "bg-green-50"}`}>
                  <Icon className={`w-3.5 h-3.5 ${tone === "blue" ? "text-blue-600" : "text-green-600"}`} />
                  <span className={`text-xs font-semibold uppercase tracking-wide ${tone === "blue" ? "text-blue-800" : "text-green-800"}`}>
                    {title}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 max-h-56 overflow-y-auto">
                  {items.map((item) => {
                    const checked = selected.includes(item.id);
                    const result = resultByCatalog.get(item.id);
                    const locked = isLocked(item.id) && checked;
                    const isAdded = checked && !originalTests.includes(item.id);
                    const isRemoved = !checked && originalTests.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className={`flex items-start gap-2 px-3 py-2 border-b border-gray-50 ${
                          locked ? "cursor-not-allowed" : "cursor-pointer hover:bg-gray-50"
                        } ${isAdded ? "bg-green-50" : isRemoved ? "bg-red-50" : ""}`}
                        title={locked ? "Has a validated result — can't be removed" : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={locked}
                          onChange={() => toggle(item.id)}
                          className="mt-0.5 rounded border-gray-300 flex-shrink-0"
                        />
                        <span className={`text-sm leading-tight ${isRemoved ? "text-red-700 line-through" : "text-gray-700"}`}>
                          {item.name}
                          {!item.is_active && <span className="ml-1 text-[10px] text-gray-400">(inactive)</span>}
                        </span>
                        {result?.result_value && (
                          <span
                            className={`ml-auto flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              result.status === "validated" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {result.status === "validated" ? "Validated" : "Result entered"}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )
          )}
          {visible.length === 0 && <p className="text-sm text-gray-400 italic">No matching tests.</p>}
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
