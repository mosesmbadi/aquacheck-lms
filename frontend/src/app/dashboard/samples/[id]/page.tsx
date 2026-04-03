"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, CheckCircle, Clock, FlaskConical, MapPin, Calendar } from "lucide-react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SampleStatusBadge, TestStatusBadge } from "@/components/ui/Badge";
import { samplesApi, testResultsApi, testCatalogApi } from "@/lib/api";
import type { TestResult, TestCatalogItem } from "@/lib/types";

type ResultDraft = {
  result_value: string;
  notes: string;
};

export default function SampleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const sampleId = Number(id);
  const router = useRouter();
  const qc = useQueryClient();

  // Local draft state: keyed by catalog_item_id
  const [drafts, setDrafts] = useState<Record<number, ResultDraft>>({});
  const [dirty, setDirty] = useState(false);

  const { data: sample, isLoading: sampleLoading } = useQuery({
    queryKey: ["sample", sampleId],
    queryFn: () => samplesApi.get(sampleId).then((r) => r.data),
    enabled: !!sampleId,
  });

  const { data: testResults = [], isLoading: resultsLoading } = useQuery({
    queryKey: ["test-results", { sample_id: sampleId }],
    queryFn: () => testResultsApi.list({ sample_id: sampleId }).then((r) => r.data),
    enabled: !!sampleId,
  });

  const { data: catalogItems = [] } = useQuery({
    queryKey: ["test-catalog"],
    queryFn: () => testCatalogApi.list({ active_only: true }).then((r) => r.data),
  });

  // Build a map of catalog_item_id -> existing test result
  const resultByCatalog: Record<number, TestResult> = {};
  for (const tr of testResults) {
    if (tr.catalog_item_id) {
      resultByCatalog[tr.catalog_item_id] = tr;
    }
  }

  // Initialize drafts from existing results when data loads.
  // Condition: update a slot if it is missing OR currently empty — this handles the
  // race where catalogItems arrives before testResults and pre-fills blanks, which
  // would otherwise block a later update when testResults finally loads.
  useEffect(() => {
    if (catalogItems.length === 0) return;
    setDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const item of catalogItems) {
        const existing = resultByCatalog[item.id];
        if (!(item.id in next) || (!next[item.id].result_value && existing?.result_value)) {
          next[item.id] = {
            result_value: existing?.result_value || "",
            notes: existing?.notes || "",
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogItems, testResults]);

  const updateDraft = useCallback((catalogId: number, field: keyof ResultDraft, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [catalogId]: { ...prev[catalogId], [field]: value },
    }));
    setDirty(true);
  }, []);

  const bulkSaveMutation = useMutation({
    mutationFn: (rows: { catalog_item_id: number; result_value?: string; notes?: string }[]) =>
      testResultsApi.bulkSave({ sample_id: sampleId, rows }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["test-results", { sample_id: sampleId }] });
      qc.invalidateQueries({ queryKey: ["sample", sampleId] });
      setDirty(false);
    },
  });

  const validateMutation = useMutation({
    mutationFn: (resultId: number) => testResultsApi.validate(resultId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["test-results", { sample_id: sampleId }] });
      qc.invalidateQueries({ queryKey: ["sample", sampleId] });
      qc.invalidateQueries({ queryKey: ["samples"] });
    },
  });

  const handleSaveAll = () => {
    const rows = Object.entries(drafts)
      .filter(([, d]) => d.result_value.trim() !== "")
      .map(([catalogId, d]) => ({
        catalog_item_id: Number(catalogId),
        result_value: d.result_value.trim(),
        notes: d.notes.trim() || undefined,
      }));
    if (rows.length > 0) {
      bulkSaveMutation.mutate(rows);
    }
  };

  // Only show tests that were requested for this sample
  const requestedIds = new Set(sample?.requested_test_ids ?? []);
  const requestedItems =
    requestedIds.size > 0 ? catalogItems.filter((c) => requestedIds.has(c.id)) : catalogItems;

  // Separate catalog items by category
  const physicochemical = requestedItems.filter((c) => c.category === "physicochemical");
  const microbiological = requestedItems.filter((c) => c.category === "microbiological");

  // Compliance helper
  const getCompliance = (item: TestCatalogItem, value: string): string | null => {
    if (!value || !item.standard_limit || item.standard_limit === "—") return null;
    const limit = item.standard_limit;
    if (limit === "Not Detectable") {
      const lower = value.toLowerCase();
      return lower === "nd" || lower === "not detectable" || lower === "not detected" || lower === "0"
        ? "COMPLIANT"
        : "NON-COMPLIANT";
    }
    // Range like "5.5 – 7.5" or "6.5-8.5"
    const rangeMatch = limit.match(/^([\d.]+)\s*[–-]\s*([\d.]+)$/);
    if (rangeMatch) {
      const num = parseFloat(value);
      if (isNaN(num)) return null;
      const lo = parseFloat(rangeMatch[1]);
      const hi = parseFloat(rangeMatch[2]);
      return num >= lo && num <= hi ? "COMPLIANT" : "NON-COMPLIANT";
    }
    // Single numeric limit — result must be ≤ limit
    const limitNum = parseFloat(limit);
    const valNum = parseFloat(value);
    if (!isNaN(limitNum) && !isNaN(valNum)) {
      return valNum <= limitNum ? "COMPLIANT" : "NON-COMPLIANT";
    }
    return null;
  };

  if (sampleLoading) {
    return (
      <DashboardLayout title="Sample Details">
        <div className="flex items-center justify-center py-20 text-gray-400">Loading...</div>
      </DashboardLayout>
    );
  }

  if (!sample) {
    return (
      <DashboardLayout title="Sample Details">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-gray-500">Sample not found.</p>
          <Button variant="secondary" onClick={() => router.push("/dashboard/samples")}>
            <ArrowLeft className="w-4 h-4" /> Back to Samples
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const filledCount = requestedItems.filter((item) => drafts[item.id]?.result_value.trim()).length;

  return (
    <DashboardLayout title={`Sample ${sample.sample_code}`}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/samples")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 font-mono">{sample.sample_code}</h1>
              <div className="flex items-center gap-2 mt-1">
                <SampleStatusBadge status={sample.status} />
                {sample.contract_id && (
                  <span className="text-xs text-gray-500">Contract #{sample.contract_id}</span>
                )}
              </div>
            </div>
          </div>
          <Button onClick={handleSaveAll} loading={bulkSaveMutation.isPending} disabled={!dirty}>
            <Save className="w-4 h-4" /> Save Results {filledCount > 0 && `(${filledCount})`}
          </Button>
        </div>

        {/* Sample details cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardBody>
              <div className="flex items-center gap-2 mb-3">
                <FlaskConical className="w-4 h-4 text-primary-500" />
                <h3 className="text-sm font-semibold text-gray-700">Sample Info</h3>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Type</dt>
                  <dd className="font-medium text-gray-900">{sample.sample_type || "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Description</dt>
                  <dd className="font-medium text-gray-900 text-right max-w-[200px] truncate">
                    {sample.description || "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Storage</dt>
                  <dd className="font-medium text-gray-900">{sample.storage_condition || "—"}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-primary-500" />
                <h3 className="text-sm font-semibold text-gray-700">Collection</h3>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Location</dt>
                  <dd className="font-medium text-gray-900">{sample.collection_location || "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Date</dt>
                  <dd className="font-medium text-gray-900">
                    {sample.collection_date ? format(new Date(sample.collection_date), "MMM d, yyyy") : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">GPS</dt>
                  <dd className="font-medium text-gray-900 text-xs">{sample.gps_coordinates || "—"}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-primary-500" />
                <h3 className="text-sm font-semibold text-gray-700">Timeline</h3>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Received</dt>
                  <dd className="font-medium text-gray-900">
                    {format(new Date(sample.received_at), "MMM d, yyyy HH:mm")}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Created</dt>
                  <dd className="font-medium text-gray-900">
                    {format(new Date(sample.created_at), "MMM d, yyyy")}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Updated</dt>
                  <dd className="font-medium text-gray-900">
                    {format(new Date(sample.updated_at), "MMM d, yyyy")}
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        </div>

        {/* Chain of custody */}
        {sample.chain_of_custody && sample.chain_of_custody.length > 0 && (
          <Card>
            <CardHeader title="Chain of Custody" subtitle={`${sample.chain_of_custody.length} entries`} />
            <CardBody className="p-0">
              <div className="divide-y divide-gray-100">
                {sample.chain_of_custody.map((entry, i) => (
                  <div key={i} className="flex items-center gap-3 px-6 py-3 text-sm">
                    <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="font-medium text-gray-700">{entry.action}</span>
                    <span className="text-gray-400 text-xs ml-auto">
                      {format(new Date(entry.timestamp), "MMM d, yyyy HH:mm")}
                    </span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        {/* ── Results Entry Table ─────────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Test Results"
            subtitle={`${filledCount} of ${requestedItems.length} tests completed`}
            action={
              <div className="flex items-center gap-2">
                {dirty && (
                  <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>
                )}
                <Button size="sm" onClick={handleSaveAll} loading={bulkSaveMutation.isPending} disabled={!dirty}>
                  <Save className="w-4 h-4" /> Save All
                </Button>
              </div>
            }
          />
          <CardBody className="p-0">
            {resultsLoading ? (
              <div className="flex items-center justify-center py-10 text-gray-400">Loading...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm border-collapse">
                  {/* ── Physicochemical Section ─── */}
                  <thead>
                    <tr className="bg-gray-700 text-white">
                      <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide" colSpan={6}>
                        Physio-Chemical Test
                      </th>
                    </tr>
                    <tr className="bg-gray-100 border-b border-gray-300">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase w-[280px]">Parameter</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase w-[220px]">Method</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase w-[120px]">Results</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase w-[130px]">Standard Limit</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase w-[130px]">Remarks</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase w-[80px]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {physicochemical.map((item) => (
                      <ResultEntryRow
                        key={item.id}
                        item={item}
                        draft={drafts[item.id] || { result_value: "", notes: "" }}
                        existingResult={resultByCatalog[item.id]}
                        onUpdate={updateDraft}
                        onValidate={(rid) => validateMutation.mutate(rid)}
                        getCompliance={getCompliance}
                      />
                    ))}
                  </tbody>

                  {/* ── Microbiological Section ─── */}
                  <thead>
                    <tr className="bg-gray-700 text-white">
                      <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide" colSpan={6}>
                        Microbiological Test
                      </th>
                    </tr>
                    <tr className="bg-gray-100 border-b border-gray-300">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Parameter</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Method</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase">Results</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase">Standard Limit</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase">Remarks</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {microbiological.map((item) => (
                      <ResultEntryRow
                        key={item.id}
                        item={item}
                        draft={drafts[item.id] || { result_value: "", notes: "" }}
                        existingResult={resultByCatalog[item.id]}
                        onUpdate={updateDraft}
                        onValidate={(rid) => validateMutation.mutate(rid)}
                        getCompliance={getCompliance}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </DashboardLayout>
  );
}

/* ── Single result row ───────────────────────────────────────────────────────── */

function ResultEntryRow({
  item,
  draft,
  existingResult,
  onUpdate,
  onValidate,
  getCompliance,
}: {
  item: TestCatalogItem;
  draft: { result_value: string; notes: string };
  existingResult?: TestResult;
  onUpdate: (catalogId: number, field: "result_value" | "notes", value: string) => void;
  onValidate: (resultId: number) => void;
  getCompliance: (item: TestCatalogItem, value: string) => string | null;
}) {
  const value = draft.result_value;
  const compliance = getCompliance(item, value);
  const isValidated = existingResult?.status === "validated";

  return (
    <tr className={`hover:bg-blue-50/50 transition-colors ${isValidated ? "bg-green-50/30" : ""}`}>
      {/* Parameter name */}
      <td className="px-3 py-1.5 text-gray-900 font-medium text-xs">
        {item.name}
      </td>

      {/* Method */}
      <td className="px-3 py-1.5 text-gray-600 text-xs">
        {item.method_name || "—"}
      </td>

      {/* Result input */}
      <td className="px-3 py-1 text-center">
        <input
          type="text"
          className={`w-full max-w-[100px] mx-auto px-2 py-1 text-center text-sm border rounded
            ${isValidated
              ? "bg-green-50 border-green-200 text-green-800 cursor-not-allowed"
              : "border-gray-300 focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
            } outline-none`}
          value={value}
          onChange={(e) => onUpdate(item.id, "result_value", e.target.value)}
          placeholder={item.unit || "—"}
          disabled={isValidated}
        />
      </td>

      {/* Standard limit */}
      <td className="px-3 py-1.5 text-center text-xs text-gray-600 font-medium">
        {item.standard_limit || "—"}
      </td>

      {/* Compliance remarks */}
      <td className="px-3 py-1.5 text-center">
        {value && compliance ? (
          <span
            className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${
              compliance === "COMPLIANT"
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {compliance}
          </span>
        ) : value ? (
          <span className="text-[10px] text-gray-400">NS</span>
        ) : null}
      </td>

      {/* Status / validate */}
      <td className="px-3 py-1.5 text-center">
        {existingResult ? (
          <div className="flex items-center justify-center gap-1">
            {existingResult.status === "validated" ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : (existingResult.status === "completed" || existingResult.status === "in_progress") ? (
              <button
                onClick={() => onValidate(existingResult.id)}
                className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-200 transition-colors"
                title="Validate this result"
              >
                Validate
              </button>
            ) : (
              <TestStatusBadge status={existingResult.status} />
            )}
          </div>
        ) : null}
      </td>
    </tr>
  );
}
