"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiErrorMessage } from "@/lib/utils";
import { format } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { quotationsApi, customersApi, testCatalogApi, testPackagesApi } from "@/lib/api";
import { CustomerSearch } from "@/components/ui/CustomerSearch";
import type { Quotation, QuotationItem, Customer, TestCatalogItem, TestPackage } from "@/lib/types";

const DEFAULT_VAT = 16;

const statusVariant: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  draft: "default",
  sent: "info",
  accepted: "success",
  rejected: "danger",
  expired: "warning",
};

export default function QuotationsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ["quotations"],
    queryFn: () => quotationsApi.list().then((r) => r.data),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => customersApi.list().then((r) => r.data),
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ["test-catalog", "active"],
    queryFn: () => testCatalogApi.list({ active_only: true }).then((r) => r.data),
  });

  return (
    <DashboardLayout title="Quotations">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-gray-500">Generate, share, and track customer quotations.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" /> New Quotation
        </Button>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b text-left text-gray-600">
            <tr>
              <th className="px-4 py-3">Quote #</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-6 text-gray-400">Loading…</td></tr>
            ) : quotes.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-6 text-gray-400">No quotations yet.</td></tr>
            ) : (
              (quotes as Quotation[]).map((q) => (
                <tr
                  key={q.id}
                  className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/dashboard/quotations/${q.id}`)}
                >
                  <td className="px-4 py-3 font-mono">{q.quote_number}</td>
                  <td className="px-4 py-3">{q.customer_name ?? `#${q.customer_id}`}</td>
                  <td className="px-4 py-3">{q.items.length}</td>
                  <td className="px-4 py-3">{q.currency} {Number(q.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3"><Badge variant={statusVariant[q.status] ?? "default"}>{q.status}</Badge></td>
                  <td className="px-4 py-3 text-gray-500">{format(new Date(q.created_at), "dd MMM yyyy")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateQuotationModal
          customers={customers as Customer[]}
          catalog={catalog as TestCatalogItem[]}
          onClose={() => setShowCreate(false)}
          onCreated={(q) => {
            qc.invalidateQueries({ queryKey: ["quotations"] });
            setShowCreate(false);
            router.push(`/dashboard/quotations/${q.id}`);
          }}
        />
      )}
    </DashboardLayout>
  );
}

function CreateQuotationModal({
  customers,
  catalog,
  onClose,
  onCreated,
}: {
  customers: Customer[];
  catalog: TestCatalogItem[];
  onClose: () => void;
  onCreated: (q: Quotation) => void;
}) {
  const [customerId, setCustomerId] = useState<number | "">("");
  const [vatRate, setVatRate] = useState<number>(DEFAULT_VAT);
  const [currency, setCurrency] = useState<string>("KES");
  const [validUntil, setValidUntil] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [terms, setTerms] = useState<string>("Payment within 30 days. Prices valid for 30 days from issue date.");
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [error, setError] = useState<string>("");

  const subtotal = items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0);
  const vatAmount = (subtotal * vatRate) / 100;
  const total = subtotal + vatAmount;

  const { data: packages = [] } = useQuery<TestPackage[]>({
    queryKey: ["test-packages"],
    queryFn: () => testPackagesApi.list(true).then((r) => r.data),
  });

  const addPackageItem = (pkg: TestPackage) => {
    // Prevent duplicate packages on the same quotation
    if (items.some((i) => i.package_id === pkg.id)) return;
    setItems((prev) => [
      ...prev,
      {
        package_id: pkg.id,
        catalog_item_id: null,
        included_catalog_ids: pkg.catalog_item_ids,
        // Snapshot test names so the quote is self-contained even if the package changes later
        included_tests: pkg.items.map((pi) => ({
          id: pi.catalog_item_id,
          name: pi.catalog_item_name ?? `Test #${pi.catalog_item_id}`,
          category: pi.catalog_item_category ?? undefined,
        })),
        name: pkg.name,
        unit: "package",
        quantity: 1,
        unit_price: Number(pkg.price),
        total: Number(pkg.price),
        package_name: pkg.name,
      },
    ]);
  };

  const addItem = (catalogItemId?: number) => {
    if (catalogItemId) {
      const t = catalog.find((c) => c.id === catalogItemId);
      if (!t) return;
      setItems((prev) => [
        ...prev,
        {
          catalog_item_id: t.id,
          name: t.name,
          unit: t.unit ?? "",
          quantity: 1,
          unit_price: Number(t.price ?? 0),
          total: Number(t.price ?? 0),
          package_name: null,
        },
      ]);
    } else {
      setItems((prev) => [
        ...prev,
        { catalog_item_id: null, name: "", unit: "", quantity: 1, unit_price: 0, total: 0, package_name: null },
      ]);
    }
  };

  const updateItem = (idx: number, patch: Partial<QuotationItem>) => {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const merged = { ...it, ...patch };
      merged.total = Number(merged.quantity || 0) * Number(merged.unit_price || 0);
      return merged;
    }));
  };

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const createMutation = useMutation({
    mutationFn: () =>
      quotationsApi
        .create({
          customer_id: Number(customerId),
          quotation_type: items.some((i) => i.package_id) ? "package" : "individual",
          items,
          vat_rate: vatRate,
          currency,
          valid_until: validUntil || undefined,
          notes: notes || undefined,
          terms: terms || undefined,
        })
        .then((r) => r.data),
    onSuccess: onCreated,
    onError: (e: unknown) => setError(apiErrorMessage(e, "Failed to create quotation")),
  });

  const submit = () => {
    setError("");
    if (!customerId) return setError("Select a customer");
    if (items.length === 0) return setError("Add at least one line item");
    if (items.some((i) => !i.name.trim())) return setError("Every line item needs a name");
    createMutation.mutate();
  };

  return (
    <Modal open={true} title="New Quotation" onClose={onClose} size="xl">
      <div className="space-y-4">
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <CustomerSearch
            customers={customers}
            value={customerId !== "" ? customerId : undefined}
            onChange={(id) => {
              setCustomerId(id ?? "");
              if (id) {
                const c = customers.find((x) => x.id === id);
                if (c?.currency) setCurrency(c.currency);
              }
            }}
            label="Customer"
            required
          />
          <Input label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
          <Input
            label="VAT Rate (%)"
            type="number"
            step="0.01"
            value={vatRate}
            onChange={(e) => setVatRate(Number(e.target.value))}
          />
          <Input
            label="Valid Until"
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">Line Items</h3>
            <div className="flex gap-2">
              {/* Add a defined package (one price line) */}
              {packages.length > 0 && (
                <Select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      const pkg = packages.find((p) => p.id === Number(e.target.value));
                      if (pkg) addPackageItem(pkg);
                      e.target.value = "";
                    }
                  }}
                >
                  <option value="">+ Add package</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {currency} {Number(p.price).toLocaleString(undefined, { minimumFractionDigits: 2 })} ({p.items.length} tests)
                    </option>
                  ))}
                </Select>
              )}
              {/* Add individual catalog test */}
              <Select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    addItem(Number(e.target.value));
                    e.target.value = "";
                  }
                }}
              >
                <option value="">+ Add individual test</option>
                {catalog.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.price ? `— ${currency} ${t.price}` : ""}
                  </option>
                ))}
              </Select>
              <Button type="button" variant="outline" size="sm" onClick={() => addItem()}>
                + Custom row
              </Button>
            </div>
          </div>

          <table className="w-full text-sm border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-2 py-1">Description</th>
                <th className="px-2 py-1 w-16">Qty</th>
                <th className="px-2 py-1 w-32">Unit Price ({currency})</th>
                <th className="px-2 py-1 w-28 text-right">Total ({currency})</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-gray-400 text-xs">
                    No items yet — add a package or individual test above.
                  </td>
                </tr>
              ) : items.map((it, idx) => {
                const isPkg = !!it.package_id;
                const pkgDef = isPkg ? packages.find((p) => p.id === it.package_id) : null;
                return (
                  <tr key={idx} className={`border-t ${isPkg ? "bg-blue-50/40" : ""}`}>
                    <td className="px-2 py-1.5">
                      {isPkg ? (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded font-medium">PACKAGE</span>
                            <span className="font-medium text-gray-800 text-sm">{it.name}</span>
                          </div>
                          {pkgDef && (
                            <div className="flex flex-wrap gap-0.5 mt-1">
                              {pkgDef.items.map((pi) => (
                                <span key={pi.id} className="text-[10px] text-gray-500 bg-gray-100 px-1 py-0.5 rounded">
                                  {pi.catalog_item_name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <input
                          className="w-full px-2 py-1 border rounded text-sm"
                          value={it.name}
                          onChange={(e) => updateItem(idx, { name: e.target.value })}
                          placeholder="Test / service name"
                        />
                      )}
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        min={1}
                        step="1"
                        className="w-16 px-2 py-1 border rounded text-sm text-center"
                        value={it.quantity}
                        onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="w-full px-2 py-1 border rounded text-sm"
                        value={it.unit_price}
                        onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })}
                      />
                    </td>
                    <td className="px-2 py-1 text-right font-mono font-medium">
                      {it.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-1 py-1 text-center">
                      <button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <div className="w-64 text-sm space-y-1">
            <div className="flex justify-between"><span>Subtotal</span><span>{currency} {subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>VAT ({vatRate}%)</span><span>{currency} {vatAmount.toFixed(2)}</span></div>
            <div className="flex justify-between font-bold border-t pt-1"><span>Total</span><span>{currency} {total.toFixed(2)}</span></div>
          </div>
        </div>

        <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Textarea label="Terms & Conditions" rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} />

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating…" : "Create Quotation"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
