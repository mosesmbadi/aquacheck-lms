"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiErrorMessage } from "@/lib/utils";
import { resultQualifiersApi } from "@/lib/api";
import type { ResultQualifier, QualifierKind } from "@/lib/types";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Plus, Pencil, ToggleLeft, ToggleRight, Trash2, Tags, BookOpen } from "lucide-react";

// ─── Form schema ─────────────────────────────────────────────────────────────

const schema = z.object({
  code: z.string().min(1, "Code is required"),
  label: z.string().min(1, "Meaning is required"),
  kind: z.enum(["qualifier", "abbreviation"]),
  // Comma-separated in the form, split into an array on submit.
  aliases: z.string().optional(),
  // Blank means "no numeric equivalent" — the token cannot be compared to a number.
  numeric_equivalent: z.string().optional(),
  exceeds_limit: z.boolean().default(false),
  is_detected: z.boolean().default(false),
  legend_scope: z.enum(["all", "waste", "non_waste"]),
  show_in_legend: z.boolean().default(true),
  sort_order: z.coerce.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});
type FormData = z.infer<typeof schema>;

const KIND_LABELS: Record<QualifierKind, string> = {
  qualifier: "Result token",
  abbreviation: "Legend abbreviation",
};

const SCOPE_LABELS: Record<string, string> = {
  all: "All reports",
  waste: "Waste water only",
  non_waste: "Potable / dialysis only",
};

/** Plain-English summary of how a token is judged, so a non-developer can sanity-check a row. */
function ruleSummary(q: ResultQualifier): string {
  if (q.kind === "abbreviation") return "Legend only — never matched against results.";
  const parts: string[] = [];
  if (q.exceeds_limit) parts.push("above any numeric limit");
  else if (q.numeric_equivalent !== null && q.numeric_equivalent !== undefined)
    parts.push(`counts as ${q.numeric_equivalent}`);
  else parts.push("no numeric value");
  parts.push(q.is_detected ? "analyte present" : "analyte absent");
  return parts.join(" · ");
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ResultQualifiersPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ResultQualifier | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [mutationError, setMutationError] = useState("");

  const { data: items = [], isLoading } = useQuery<ResultQualifier[]>({
    queryKey: ["result-qualifiers", showInactive],
    queryFn: () => resultQualifiersApi.list({ active_only: !showInactive }).then((r) => r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["result-qualifiers"] });

  const createMutation = useMutation({
    mutationFn: (data: Partial<ResultQualifier>) => resultQualifiersApi.create(data),
    onSuccess: () => { invalidate(); closeModal(); },
    onError: (err: unknown) =>
      setMutationError(apiErrorMessage(err, "Failed to save. Admin or manager role required.")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ResultQualifier> }) =>
      resultQualifiersApi.update(id, data),
    onSuccess: () => { invalidate(); closeModal(); },
    onError: (err: unknown) =>
      setMutationError(apiErrorMessage(err, "Failed to save changes. Admin or manager role required.")),
  });

  const toggleMutation = useMutation({
    mutationFn: (item: ResultQualifier) =>
      resultQualifiersApi.update(item.id, { is_active: !item.is_active }),
    onSuccess: invalidate,
    onError: (err: unknown) =>
      setMutationError(apiErrorMessage(err, "Failed to update. Admin or manager role required.")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => resultQualifiersApi.delete(id),
    onSuccess: () => { invalidate(); setMutationError(""); },
    onError: (err: unknown) =>
      setMutationError(apiErrorMessage(err, "Failed to delete. Admin or manager role required.")),
  });

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isValid },
  } = useForm<FormData>({ resolver: zodResolver(schema), mode: "onChange" });

  const kind = watch("kind");

  function openCreate() {
    reset({
      code: "", label: "", kind: "qualifier", aliases: "", numeric_equivalent: "",
      exceeds_limit: false, is_detected: false, legend_scope: "all",
      show_in_legend: true, sort_order: 0, is_active: true,
    });
    setEditing(null);
    setShowModal(true);
  }

  function openEdit(item: ResultQualifier) {
    reset({
      code: item.code,
      label: item.label,
      kind: item.kind,
      aliases: (item.aliases ?? []).join(", "),
      numeric_equivalent:
        item.numeric_equivalent === null || item.numeric_equivalent === undefined
          ? ""
          : String(item.numeric_equivalent),
      exceeds_limit: item.exceeds_limit,
      is_detected: item.is_detected,
      legend_scope: item.legend_scope,
      show_in_legend: item.show_in_legend,
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

  function onSubmit(form: FormData) {
    const trimmedNumber = (form.numeric_equivalent ?? "").trim();
    const payload: Partial<ResultQualifier> = {
      code: form.code.trim(),
      label: form.label.trim(),
      kind: form.kind,
      aliases: (form.aliases ?? "")
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      numeric_equivalent: trimmedNumber === "" ? null : Number(trimmedNumber),
      exceeds_limit: form.kind === "qualifier" ? form.exceeds_limit : false,
      is_detected: form.kind === "qualifier" ? form.is_detected : false,
      legend_scope: form.legend_scope,
      show_in_legend: form.show_in_legend,
      sort_order: form.sort_order,
      is_active: form.is_active,
    };
    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
  }

  const loading = createMutation.isPending || updateMutation.isPending;
  const tokens = items.filter((i) => i.kind === "qualifier");
  const abbreviations = items.filter((i) => i.kind === "abbreviation");

  function renderRows(rows: ResultQualifier[]) {
    return rows.map((item) => (
      <tr key={item.id} className={`hover:bg-blue-50/50 ${item.is_active ? "" : "opacity-50"}`}>
        <td className="px-3 py-2 font-medium text-gray-900">{item.code}</td>
        <td className="px-3 py-2 text-gray-700">{item.label}</td>
        <td className="px-3 py-2 text-gray-500 text-xs">
          {(item.aliases ?? []).length > 0 ? (item.aliases ?? []).join(", ") : "—"}
        </td>
        <td className="px-3 py-2 text-gray-600 text-xs">{ruleSummary(item)}</td>
        <td className="px-3 py-2 text-xs text-gray-600">
          {item.show_in_legend ? SCOPE_LABELS[item.legend_scope] : "Hidden"}
        </td>
        <td className="px-3 py-2 text-center text-xs text-gray-500">{item.sort_order}</td>
        <td className="px-3 py-2">
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => openEdit(item)}
              className="p-1.5 text-gray-500 hover:text-primary-600 rounded"
              title="Edit"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => toggleMutation.mutate(item)}
              className="p-1.5 text-gray-500 hover:text-primary-600 rounded"
              title={item.is_active ? "Deactivate" : "Activate"}
            >
              {item.is_active ? (
                <ToggleRight className="w-4 h-4 text-green-600" />
              ) : (
                <ToggleLeft className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={() => {
                if (confirm(`Delete "${item.code}"? Reports will stop recognising this token.`)) {
                  deleteMutation.mutate(item.id);
                }
              }}
              className="p-1.5 text-gray-500 hover:text-red-600 rounded"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
    ));
  }

  return (
    <DashboardLayout title="Result Qualifiers">
      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Result qualifiers &amp; report legend</h2>
              <p className="text-xs text-gray-500 mt-0.5 max-w-3xl">
                Non-numeric result tokens (ND, TNTC, Detected…) and the abbreviations printed
                under the results table. Result tokens decide the REMARKS column on the test
                report, so changing a rule here changes how every report is judged.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Show inactive
              </label>
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </div>
          </div>
          {mutationError && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded border border-red-200">
              {mutationError}
            </p>
          )}
        </Card>

        {isLoading ? (
          <div className="py-16 text-center text-gray-400">Loading…</div>
        ) : (
          <>
            <Card className="overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
                <Tags className="w-4 h-4 text-primary-600" />
                <h3 className="text-sm font-semibold text-gray-900">Result tokens</h3>
                <Badge variant="default">{tokens.length}</Badge>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Meaning</th>
                    <th className="px-3 py-2 text-left">Also accepts</th>
                    <th className="px-3 py-2 text-left">Compliance rule</th>
                    <th className="px-3 py-2 text-left">Legend</th>
                    <th className="px-3 py-2 text-center">Order</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tokens.length > 0 ? (
                    renderRows(tokens)
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-gray-400 text-xs">
                        No result tokens defined.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>

            <Card className="overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary-600" />
                <h3 className="text-sm font-semibold text-gray-900">Legend abbreviations</h3>
                <Badge variant="default">{abbreviations.length}</Badge>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Meaning</th>
                    <th className="px-3 py-2 text-left">Also accepts</th>
                    <th className="px-3 py-2 text-left">Compliance rule</th>
                    <th className="px-3 py-2 text-left">Legend</th>
                    <th className="px-3 py-2 text-center">Order</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {abbreviations.length > 0 ? (
                    renderRows(abbreviations)
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-gray-400 text-xs">
                        No legend abbreviations defined.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </div>

      <Modal
        open={showModal}
        onClose={closeModal}
        title={editing ? `Edit ${editing.code}` : "Add Result Qualifier"}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {mutationError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded border border-red-200">
              {mutationError}
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input label="Code" error={errors.code?.message} {...register("code")} placeholder="e.g. TNTC" />
            <Select label="Type" error={errors.kind?.message} {...register("kind")}>
              <option value="qualifier">{KIND_LABELS.qualifier}</option>
              <option value="abbreviation">{KIND_LABELS.abbreviation}</option>
            </Select>
          </div>

          <Input
            label="Meaning"
            error={errors.label?.message}
            {...register("label")}
            placeholder="e.g. Too Numerous To Count"
          />

          {kind === "qualifier" && (
            <>
              <Input
                label="Also accepts (comma separated)"
                error={errors.aliases?.message}
                {...register("aliases")}
                placeholder="tntc, too numerous to count"
                hint="Other spellings an analyst might type. Matching ignores upper/lower case."
              />

              <div className="rounded-lg border border-gray-200 p-3 space-y-3 bg-gray-50/60">
                <p className="text-xs font-semibold text-gray-700 uppercase">Compliance rule</p>
                <Input
                  label="Counts as the number"
                  type="number"
                  step="any"
                  error={errors.numeric_equivalent?.message}
                  {...register("numeric_equivalent")}
                  placeholder="leave blank if not a number"
                  hint="e.g. ND counts as 0. Leave blank when the token has no numeric value."
                />
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input type="checkbox" {...register("exceeds_limit")} className="mt-0.5 rounded border-gray-300" />
                  <span>
                    Above any numeric limit
                    <span className="block text-xs text-gray-500">
                      Always non-compliant against a numeric standard — this is what makes TNTC fail.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input type="checkbox" {...register("is_detected")} className="mt-0.5 rounded border-gray-300" />
                  <span>
                    Means the analyte was present
                    <span className="block text-xs text-gray-500">
                      Non-compliant against &ldquo;Not Detectable&rdquo; / &ldquo;Nil&rdquo; standards.
                    </span>
                  </span>
                </label>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Select label="Printed on" error={errors.legend_scope?.message} {...register("legend_scope")}>
              <option value="all">{SCOPE_LABELS.all}</option>
              <option value="non_waste">{SCOPE_LABELS.non_waste}</option>
              <option value="waste">{SCOPE_LABELS.waste}</option>
            </Select>
            <Input label="Sort Order" type="number" error={errors.sort_order?.message} {...register("sort_order")} />
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" {...register("show_in_legend")} className="rounded border-gray-300" />
              Show in report legend
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" {...register("is_active")} className="rounded border-gray-300" />
              Active
            </label>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button type="submit" loading={loading} disabled={!isValid}>
              {editing ? "Save Changes" : "Add Qualifier"}
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
