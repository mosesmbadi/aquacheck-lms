"use client";

import { useState, useEffect } from "react";
import { useForm, useController, Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { contractsApi, customersApi, testCatalogApi } from "@/lib/api";
import type { TestCatalogItem } from "@/lib/types";
import {
  FlaskConical,
  Microscope,
  Droplets,
  Factory,
  Waves,
  Leaf,
  Building2,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const SAMPLE_CATEGORIES = [
  { value: "dialysis", label: "Dialysis Water", icon: Droplets, color: "blue" },
  { value: "potable", label: "Potable Water", icon: Waves, color: "teal" },
  { value: "waste", label: "Waste Water", icon: Factory, color: "orange" },
  { value: "packaged_drinking_water", label: "Packaged Drinking Water", icon: FlaskConical, color: "purple" },
] as const;

const DISCHARGE_DESTINATIONS = [
  {
    value: "environment",
    label: "Into the Environment",
    schedule: "3rd Schedule",
    description: "Car wash runoff, irrigation, surface water, ground discharge",
    icon: Leaf,
    color: "green",
  },
  {
    value: "public_sewer",
    label: "Into Public Sewer",
    schedule: "5th Schedule",
    description: "Discharge into existing sewerage systems",
    icon: Building2,
    color: "blue",
  },
] as const;

function getWaterType(category: string): string {
  if (category === "dialysis") return "dialysis_potable";
  if (category === "potable") return "potable";
  if (category === "packaged_drinking_water") return "packaged_drinking_water";
  return "";
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z
  .object({
    customer_id: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : v),
      z.coerce.number().int().positive().optional()
    ),
    contract_id: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : v),
      z.coerce.number().int().positive().optional()
    ),
    sample_category: z.enum(["dialysis", "potable", "waste", "packaged_drinking_water"], {
      required_error: "Sample category is required",
    }),
    waste_industry_type: z.string().optional().nullable(),
    discharge_destination: z
      .enum(["environment", "public_sewer"])
      .optional()
      .nullable(),
    description: z.string().optional(),
    sample_type: z.string().optional(),
    collection_date: z.string().optional(),
    collection_location: z.string().optional(),
    gps_coordinates: z.string().optional(),
    storage_condition: z.string().optional(),
    requested_test_ids: z.array(z.number().int().positive()).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.sample_category === "waste") {
      if (!data.waste_industry_type) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Industry type is required for Waste Water samples",
          path: ["waste_industry_type"],
        });
      }
      if (!data.discharge_destination) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Discharge destination is required for Waste Water samples",
          path: ["discharge_destination"],
        });
      }
    }
  });

type FormData = z.infer<typeof schema>;

interface SampleFormProps {
  onSubmit: (data: FormData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  customerId?: number;
}

// ─── Test picker ──────────────────────────────────────────────────────────────

function TestPicker({
  control,
  catalogItems,
  suggestedIds,
}: {
  control: Control<FormData>;
  catalogItems: TestCatalogItem[];
  suggestedIds?: number[];
}) {
  const { field } = useController({ control, name: "requested_test_ids" });
  const selected: number[] = field.value ?? [];

  function toggle(id: number) {
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id];
    field.onChange(next);
  }

  function toggleGroup(ids: number[]) {
    const allSelected = ids.every((id) => selected.includes(id));
    field.onChange(
      allSelected
        ? selected.filter((id) => !ids.includes(id))
        : [...selected, ...ids.filter((id) => !selected.includes(id))]
    );
  }

  const physio = catalogItems.filter((i) => i.category === "physicochemical");
  const micro = catalogItems.filter((i) => i.category === "microbiological");
  const physioIds = physio.map((i) => i.id);
  const microIds = micro.map((i) => i.id);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          Tests to be Performed
        </label>
        <div className="flex items-center gap-2">
          {suggestedIds && suggestedIds.length > 0 && (
            <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
              {suggestedIds.length} pre-selected from Schedule 4
            </span>
          )}
          {selected.length > 0 && (
            <span className="text-xs text-primary-600 font-medium bg-primary-50 px-2 py-0.5 rounded-full">
              {selected.length} selected
            </span>
          )}
        </div>
      </div>

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
                checked={physioIds.every((id) => selected.includes(id))}
                onChange={() => toggleGroup(physioIds)}
                className="rounded border-blue-300"
              />
              Select all
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 max-h-52 overflow-y-auto">
            {physio.map((item) => (
              <label
                key={item.id}
                className={`flex items-start gap-2 px-3 py-2 cursor-pointer border-b border-gray-50 ${
                  suggestedIds?.includes(item.id)
                    ? "bg-orange-50 hover:bg-orange-100"
                    : "hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={() => toggle(item.id)}
                  className="mt-0.5 rounded border-gray-300 flex-shrink-0"
                />
                <span className="text-sm text-gray-700 leading-tight">{item.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

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
                checked={microIds.every((id) => selected.includes(id))}
                onChange={() => toggleGroup(microIds)}
                className="rounded border-green-300"
              />
              Select all
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 max-h-36 overflow-y-auto">
            {micro.map((item) => (
              <label
                key={item.id}
                className={`flex items-start gap-2 px-3 py-2 cursor-pointer border-b border-gray-50 ${
                  suggestedIds?.includes(item.id)
                    ? "bg-orange-50 hover:bg-orange-100"
                    : "hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={() => toggle(item.id)}
                  className="mt-0.5 rounded border-gray-300 flex-shrink-0"
                />
                <span className="text-sm text-gray-700 leading-tight">{item.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {catalogItems.length === 0 && (
        <p className="text-sm text-gray-400 italic">No catalog tests available.</p>
      )}
    </div>
  );
}

// ─── Category card ────────────────────────────────────────────────────────────

function CategoryCard({
  category,
  selected,
  onClick,
}: {
  category: (typeof SAMPLE_CATEGORIES)[number];
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = category.icon;
  const colorMap = {
    blue: selected
      ? "border-blue-500 bg-blue-50 text-blue-700"
      : "border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-600",
    teal: selected
      ? "border-teal-500 bg-teal-50 text-teal-700"
      : "border-gray-200 hover:border-teal-300 hover:bg-teal-50 text-gray-600",
    orange: selected
      ? "border-orange-500 bg-orange-50 text-orange-700"
      : "border-gray-200 hover:border-orange-300 hover:bg-orange-50 text-gray-600",
  } as const;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all cursor-pointer w-full ${colorMap[category.color]}`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-xs font-semibold text-center leading-tight">
        {category.label}
      </span>
    </button>
  );
}

// ─── Step badge ───────────────────────────────────────────────────────────────

function StepBadge({ n, label, done }: { n: number; label: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span
        className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          done ? "bg-green-500 text-white" : "bg-orange-500 text-white"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <span className="text-sm font-semibold text-gray-700">{label}</span>
    </div>
  );
}

// ─── Main form ────────────────────────────────────────────────────────────────

export function SampleForm({ onSubmit, onCancel, loading, customerId }: SampleFormProps) {
  const isCustomer = customerId !== undefined;

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => customersApi.list().then((r) => r.data),
    enabled: !isCustomer,
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts"],
    queryFn: () => contractsApi.list().then((r) => r.data),
  });

  const { data: industryTypes = [] } = useQuery({
    queryKey: ["industry-types"],
    queryFn: () => testCatalogApi.industryTypes().then((r) => r.data),
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: customerId,
      requested_test_ids: [],
      waste_industry_type: null,
      discharge_destination: null,
    },
  });

  const selectedCustomerId = watch("customer_id");
  const sampleCategory = watch("sample_category");
  const wasteIndustryType = watch("waste_industry_type");
  const dischargeDestination = watch("discharge_destination");

  const effectiveCustomerId = isCustomer ? customerId : selectedCustomerId;
  const filteredContracts = effectiveCustomerId
    ? contracts.filter((c) => c.customer_id === effectiveCustomerId)
    : contracts;

  // Catalog fetch: dialysis/potable use their own water_type; waste uses suggested endpoint
  const nonWasteWaterType = sampleCategory && sampleCategory !== "waste"
    ? getWaterType(sampleCategory)
    : "";

  const { data: nonWasteCatalog = [] } = useQuery({
    queryKey: ["test-catalog", nonWasteWaterType],
    queryFn: () =>
      testCatalogApi.list({ active_only: true, water_type: nonWasteWaterType }).then((r) => r.data),
    enabled: !!nonWasteWaterType,
  });

  const wasteParamsReady =
    sampleCategory === "waste" && !!wasteIndustryType && !!dischargeDestination;

  const { data: suggestedItems = [] } = useQuery({
    queryKey: ["test-catalog-suggested", wasteIndustryType, dischargeDestination],
    queryFn: () =>
      testCatalogApi
        .suggested(wasteIndustryType!, dischargeDestination!)
        .then((r) => r.data),
    enabled: wasteParamsReady,
  });

  // When suggested tests load, pre-select them (only on first load)
  const suggestedIds = suggestedItems.map((i) => i.id);

  // Full catalog for waste (all waste_3 or waste_5) so user can add beyond suggestions
  const wasteWaterType =
    dischargeDestination === "environment"
      ? "waste_3"
      : dischargeDestination === "public_sewer"
      ? "waste_5"
      : "";

  const { data: fullWasteCatalog = [] } = useQuery({
    queryKey: ["test-catalog", wasteWaterType],
    queryFn: () =>
      testCatalogApi.list({ active_only: true, water_type: wasteWaterType }).then((r) => r.data),
    enabled: !!wasteWaterType,
  });

  // Pre-select suggested tests when they first load
  const [suggestionsApplied, setSuggestionsApplied] = useState(false);

  useEffect(() => {
    if (wasteParamsReady && suggestedItems.length > 0 && !suggestionsApplied) {
      setValue("requested_test_ids", suggestedIds);
      setSuggestionsApplied(true);
    }
  }, [wasteParamsReady, suggestedItems, suggestionsApplied, setValue]);  // eslint-disable-line

  const catalogItems = sampleCategory === "waste" ? fullWasteCatalog : nonWasteCatalog;
  const testsReady =
    sampleCategory === "waste"
      ? wasteParamsReady
      : !!nonWasteWaterType;

  function handleCategoryChange(value: "dialysis" | "potable" | "waste" | "packaged_drinking_water") {
    setValue("sample_category", value, { shouldValidate: true });
    setValue("waste_industry_type", null);
    setValue("discharge_destination", null);
    setValue("requested_test_ids", []);
    setSuggestionsApplied(false); // allow re-applying for next waste selection
  }

  function handleIndustryChange(value: string) {
    setValue("waste_industry_type", value || null, { shouldValidate: true });
    setValue("discharge_destination", null);
    setValue("requested_test_ids", []);
    setSuggestionsApplied(false);
  }

  function handleDestinationChange(value: "environment" | "public_sewer") {
    setValue("discharge_destination", value, { shouldValidate: true });
    setValue("requested_test_ids", []);
    setSuggestionsApplied(false);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Customer selector */}
      {!isCustomer && (
        <Select
          label="Customer (optional)"
          error={errors.customer_id?.message}
          {...register("customer_id")}
        >
          <option value="">No specific customer</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      )}

      <div className="space-y-2">
        <Select
          label="Contract (optional)"
          error={errors.contract_id?.message}
          {...register("contract_id")}
        >
          <option value="">Standalone sample (no contract)</option>
          {filteredContracts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.contract_number} — {c.title}
            </option>
          ))}
        </Select>
        <p className="text-xs text-gray-500">
          Leave blank to register a standalone sample. Only samples linked to a contract can proceed to testing.
        </p>
      </div>

      {/* Step 1 — Sample category */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Sample Category <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {SAMPLE_CATEGORIES.map((cat) => (
            <CategoryCard
              key={cat.value}
              category={cat}
              selected={sampleCategory === cat.value}
              onClick={() => handleCategoryChange(cat.value)}
            />
          ))}
        </div>
        {errors.sample_category && (
          <p className="text-xs text-red-500">{errors.sample_category.message}</p>
        )}
      </div>

      {/* ── Waste Water wizard ── */}
      {sampleCategory === "waste" && (
        <div className="border border-orange-200 rounded-xl bg-orange-50/40 p-4 space-y-5">
          {/* Step 2 — Industry type */}
          <div>
            <StepBadge n={2} label="Industry / Source Type (Schedule 4)" done={!!wasteIndustryType} />
            <p className="text-xs text-gray-500 mb-2 ml-7">
              Select the type of facility or process that generated this wastewater.
              This determines which parameters need to be monitored.
            </p>
            <select
              className={`w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 ${
                errors.waste_industry_type ? "border-red-400" : "border-gray-300"
              }`}
              value={wasteIndustryType ?? ""}
              onChange={(e) => handleIndustryChange(e.target.value)}
            >
              <option value="">— Select industry type —</option>
              {industryTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {errors.waste_industry_type && (
              <p className="text-xs text-red-500 mt-1">{errors.waste_industry_type.message}</p>
            )}
          </div>

          {/* Step 3 — Discharge destination */}
          {wasteIndustryType && (
            <div>
              <StepBadge
                n={3}
                label="Where will the treated water be discharged?"
                done={!!dischargeDestination}
              />
              <p className="text-xs text-gray-500 mb-3 ml-7">
                This determines which NEMA schedule is applied on the report.
              </p>
              <div className="grid grid-cols-2 gap-3 ml-7">
                {DISCHARGE_DESTINATIONS.map((dest) => {
                  const Icon = dest.icon;
                  const isSelected = dischargeDestination === dest.value;
                  const colorMap = {
                    green: isSelected
                      ? "border-green-500 bg-green-50"
                      : "border-gray-200 hover:border-green-300 hover:bg-green-50",
                    blue: isSelected
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-blue-300 hover:bg-blue-50",
                  } as const;
                  return (
                    <button
                      key={dest.value}
                      type="button"
                      onClick={() => handleDestinationChange(dest.value)}
                      className={`flex flex-col items-start gap-2 p-3 rounded-lg border-2 text-left transition-all ${
                        colorMap[dest.color]
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon
                          className={`w-4 h-4 ${
                            dest.color === "green" ? "text-green-600" : "text-blue-600"
                          }`}
                        />
                        <span className="text-sm font-semibold text-gray-800">
                          {dest.label}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                          dest.color === "green"
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {dest.schedule}
                      </span>
                      <span className="text-xs text-gray-500 leading-tight">
                        {dest.description}
                      </span>
                    </button>
                  );
                })}
              </div>
              {errors.discharge_destination && (
                <p className="text-xs text-red-500 mt-1 ml-7">
                  {errors.discharge_destination.message}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Rest of form — shown after category (and waste wizard) is complete */}
      {testsReady && (
        <>
          <Input
            label="Sample Description (optional)"
            error={errors.sample_type?.message}
            {...register("sample_type")}
            placeholder="e.g. Treated effluent — Nairobi facility"
          />

          <Textarea
            label="Notes"
            error={errors.description?.message}
            {...register("description")}
            rows={2}
            placeholder="Additional notes about the sample..."
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Collection Date"
              type="date"
              error={errors.collection_date?.message}
              {...register("collection_date")}
            />
            <Input
              label="Collection Location"
              error={errors.collection_location?.message}
              {...register("collection_location")}
              placeholder="e.g. Nairobi, East Gate Rd"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="GPS Coordinates"
              error={errors.gps_coordinates?.message}
              {...register("gps_coordinates")}
              placeholder="-1.2921, 36.8219"
            />
            <Input
              label="Storage Condition"
              error={errors.storage_condition?.message}
              {...register("storage_condition")}
              placeholder="e.g. 4°C, dark"
            />
          </div>

          <TestPicker
            control={control}
            catalogItems={catalogItems}
            suggestedIds={sampleCategory === "waste" ? suggestedIds : undefined}
          />
        </>
      )}

      <div className="flex gap-3 justify-end pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={loading} disabled={!testsReady}>
          Register Sample
        </Button>
      </div>
    </form>
  );
}
