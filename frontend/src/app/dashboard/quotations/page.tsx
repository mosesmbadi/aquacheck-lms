"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { quotationsApi, customersApi, testCatalogApi } from "@/lib/api";
import type { Quotation, QuotationItem, Customer, TestCatalogItem } from "@/lib/types";

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
        },
      ]);
    } else {
      setItems((prev) => [
        ...prev,
        { catalog_item_id: null, name: "", unit: "", quantity: 1, unit_price: 0, total: 0 },
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
          items,
          vat_rate: vatRate,
          currency,
          valid_until: validUntil || undefined,
          notes: notes || undefined,
          terms: terms || undefined,
        })
        .then((r) => r.data),
    onSuccess: onCreated,
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Failed to create quotation"),
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
          <Select
            label="Customer"
            value={customerId}
            onChange={(e) => {
              const id = Number(e.target.value);
              setCustomerId(id);
              const c = customers.find((x) => x.id === id);
              if (c?.currency) setCurrency(c.currency);
            }}
          >
            <option value="">— Select customer —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
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
              <Select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    addItem(Number(e.target.value));
                    e.target.value = "";
                  }
                }}
              >
                <option value="">+ Add from catalog</option>
                {catalog.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.price ? `— ${currency} ${t.price}` : ""}
                  </option>
                ))}
              </Select>
              <Button type="button" variant="outline" size="sm" onClick={() => addItem()}>
                + Custom
              </Button>
            </div>
          </div>

          <table className="w-full text-sm border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-2 py-1">Name</th>
                <th className="px-2 py-1 w-20">Unit</th>
                <th className="px-2 py-1 w-20">Qty</th>
                <th className="px-2 py-1 w-28">Unit Price</th>
                <th className="px-2 py-1 w-28 text-right">Total</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={6} className="px-2 py-4 text-center text-gray-400">No items</td></tr>
              ) : items.map((it, idx) => (
                <tr key={idx} className="border-t">
                  <td className="px-1 py-1">
                    <input
                      className="w-full px-2 py-1 border rounded text-sm"
                      value={it.name}
                      onChange={(e) => updateItem(idx, { name: e.target.value })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      className="w-full px-2 py-1 border rounded text-sm"
                      value={it.unit ?? ""}
                      onChange={(e) => updateItem(idx, { unit: e.target.value })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-full px-2 py-1 border rounded text-sm"
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
                  <td className="px-2 py-1 text-right">
                    {currency} {it.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-1 py-1">
                    <button type="button" onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
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
