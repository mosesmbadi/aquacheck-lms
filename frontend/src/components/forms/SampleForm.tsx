"use client";

import { useForm, useController, Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { contractsApi, customersApi, testCatalogApi } from "@/lib/api";
import type { TestCatalogItem } from "@/lib/types";
import { FlaskConical, Microscope, Droplets, Factory, Waves } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const SAMPLE_CATEGORIES = [
  { value: "dialysis", label: "Dialysis Water", icon: Droplets, color: "blue" },
  { value: "potable", label: "Potable Water", icon: Waves, color: "teal" },
  { value: "waste", label: "Waste Water", icon: Factory, color: "orange" },
] as const;

const WASTE_SCHEDULES = [
  { value: 1, label: "1st Schedule", description: "Quality Standards for Sources of Domestic Water" },
  { value: 2, label: "2nd Schedule", description: "Water Quality Monitoring for Sources of Domestic Water" },
  { value: 3, label: "3rd Schedule", description: "Standards for Effluent Discharge Into the Environment" },
  { value: 4, label: "4th Schedule", description: "Monitoring Guide for Discharge Into the Environment" },
  { value: 5, label: "5th Schedule", description: "Standards for Effluent Discharge Into Public Sewers" },
  { value: 6, label: "6th Schedule", description: "Monitoring for Discharge of Treated Effluent Into the Environment" },
] as const;

function getWaterType(category: string, schedule?: number | null): string {
  if (category === "dialysis" || category === "potable") return "dialysis_potable";
  if (category === "waste" && schedule) return `waste_${schedule}`;
  return "";
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z
  .object({
    customer_id: z.preprocess(
      (value) => (value === "" || value === null || value === undefined ? undefined : value),
      z.coerce.number().int().positive().optional()
    ),
    contract_id: z.preprocess(
      (value) => (value === "" || value === null || value === undefined ? undefined : value),
      z.coerce.number().int().positive().optional()
    ),
    sample_category: z.enum(["dialysis", "potable", "waste"], {
      required_error: "Sample category is required",
    }),
    waste_schedule: z.number().int().min(1).max(6).optional().nullable(),
    description: z.string().optional(),
    sample_type: z.string().optional(),
    collection_date: z.string().optional(),
    collection_location: z.string().optional(),
    gps_coordinates: z.string().optional(),
    storage_condition: z.string().optional(),
    requested_test_ids: z.array(z.number().int().positive()).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.sample_category === "waste" && !data.waste_schedule) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Schedule is required for Waste Water samples",
        path: ["waste_schedule"],
      });
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

function TestPicker({ control, catalogItems }: { control: Control<FormData>; catalogItems: TestCatalogItem[] }) {
  const { field } = useController({ control, name: "requested_test_ids" });
  const selected: number[] = field.value ?? [];

  function toggle(id: number) {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    field.onChange(next);
  }

  function toggleGroup(ids: number[]) {
    const allSelected = ids.every((id) => selected.includes(id));
    if (allSelected) {
      field.onChange(selected.filter((id) => !ids.includes(id)));
    } else {
      const toAdd = ids.filter((id) => !selected.includes(id));
      field.onChange([...selected, ...toAdd]);
    }
  }

  const physio = catalogItems.filter((i) => i.category === "physicochemical");
  const micro = catalogItems.filter((i) => i.category === "microbiological");

  const physioIds = physio.map((i) => i.id);
  const microIds = micro.map((i) => i.id);

  const allPhysioSelected = physioIds.length > 0 && physioIds.every((id) => selected.includes(id));
  const allMicroSelected = microIds.length > 0 && microIds.every((id) => selected.includes(id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">Tests to be Performed</label>
        {selected.length > 0 && (
          <span className="text-xs text-primary-600 font-medium bg-primary-50 px-2 py-0.5 rounded-full">
            {selected.length} selected
          </span>
        )}
      </div>

      {physio.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-gray-200">
            <FlaskConical className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-xs font-semibold text-blue-800 uppercase tracking-wide">Physio-Chemical</span>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-blue-700 cursor-pointer">
              <input
                type="checkbox"
                checked={allPhysioSelected}
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
                className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50"
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
            <span className="text-xs font-semibold text-green-800 uppercase tracking-wide">Microbiological</span>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-green-700 cursor-pointer">
              <input
                type="checkbox"
                checked={allMicroSelected}
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
                className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50"
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
      <span className="text-xs font-semibold text-center leading-tight">{category.label}</span>
    </button>
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

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { customer_id: customerId, requested_test_ids: [], waste_schedule: null },
  });

  const selectedCustomerId = watch("customer_id");
  const sampleCategory = watch("sample_category");
  const wasteSchedule = watch("waste_schedule");

  const effectiveCustomerId = isCustomer ? customerId : selectedCustomerId;
  const filteredContracts = effectiveCustomerId
    ? contracts.filter((c) => c.customer_id === effectiveCustomerId)
    : contracts;

  const waterType = sampleCategory ? getWaterType(sampleCategory, wasteSchedule) : "";
  const testsReady = !!waterType;

  const { data: catalogItems = [] } = useQuery({
    queryKey: ["test-catalog", waterType],
    queryFn: () => testCatalogApi.list({ active_only: true, water_type: waterType }).then((r) => r.data),
    enabled: testsReady,
  });

  function handleCategoryChange(value: "dialysis" | "potable" | "waste") {
    setValue("sample_category", value, { shouldValidate: true });
    setValue("waste_schedule", null);
    setValue("requested_test_ids", []);
  }

  function handleScheduleChange(schedule: number) {
    setValue("waste_schedule", schedule, { shouldValidate: true });
    setValue("requested_test_ids", []);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Customer selector */}
      {!isCustomer && (
        <Select label="Customer (optional)" error={errors.customer_id?.message} {...register("customer_id")}>
          <option value="">No specific customer</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      )}

      <div className="space-y-2">
        <Select label="Contract (optional)" error={errors.contract_id?.message} {...register("contract_id")}>
          <option value="">Standalone sample (no contract)</option>
          {filteredContracts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.contract_number} — {c.title}
            </option>
          ))}
        </Select>
        <p className="text-xs text-gray-500">
          Leave this blank to register a standalone sample. Only samples linked to a contract can proceed to testing.
        </p>
      </div>

      {/* Sample category selection */}
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

      {/* Waste schedule selection */}
      {sampleCategory === "waste" && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Schedule <span className="text-red-500">*</span>
          </label>
          <div className="space-y-1.5">
            {WASTE_SCHEDULES.map((sched) => (
              <button
                key={sched.value}
                type="button"
                onClick={() => handleScheduleChange(sched.value)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg border-2 text-left transition-all ${
                  wasteSchedule === sched.value
                    ? "border-orange-500 bg-orange-50"
                    : "border-gray-200 hover:border-orange-300 hover:bg-orange-50"
                }`}
              >
                <span
                  className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    wasteSchedule === sched.value
                      ? "bg-orange-500 text-white"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {sched.value}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-800">{sched.label}</span>
                  <span className="block text-xs text-gray-500 leading-tight">{sched.description}</span>
                </span>
              </button>
            ))}
          </div>
          {errors.waste_schedule && (
            <p className="text-xs text-red-500">{errors.waste_schedule.message}</p>
          )}
        </div>
      )}

      {/* Rest of form fields — shown after category (and schedule for waste) is selected */}
      {testsReady && (
        <>
          <Input
            label="Sample Description (optional)"
            error={errors.sample_type?.message}
            {...register("sample_type")}
            placeholder="e.g. Borehole water — Kisumu facility, RO membrane treated"
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
              placeholder="e.g. Dialysis Unit, Ward 3"
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

          <TestPicker control={control} catalogItems={catalogItems} />
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
