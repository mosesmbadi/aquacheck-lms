"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Send, CheckCircle, Plus, Pencil } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea } from "@/components/ui/Input";
import { Table } from "@/components/ui/Table";
import { invoicesApi } from "@/lib/api";
import type { Invoice, InvoiceItem, InvoiceStatus } from "@/lib/types";
import { getCurrentUser } from "@/lib/auth";

const STATUS_VARIANT: Record<InvoiceStatus, "default" | "info" | "success" | "danger" | "warning"> = {
  draft: "default",
  issued: "info",
  paid: "success",
  void: "danger",
};

export default function InvoicesPage() {
  const qc = useQueryClient();
  const currentUser = getCurrentUser();
  const isCustomer = currentUser?.role === "customer";
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => invoicesApi.list().then((r) => r.data),
  });

  const issueMut = useMutation({
    mutationFn: (id: number) => invoicesApi.issue(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });

  const paidMut = useMutation({
    mutationFn: (id: number) => invoicesApi.markPaid(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });

  const columns = [
    {
      key: "invoice_number",
      header: "Invoice #",
      render: (r: Invoice) => (
        <button
          className="font-mono font-medium text-primary-600 hover:underline"
          onClick={() => setEditInvoice(r)}
        >
          {r.invoice_number}
        </button>
      ),
    },
    {
      key: "sample_code",
      header: "Sample",
      render: (r: Invoice) => <span className="text-xs text-gray-600">{r.sample_code ?? "—"}</span>,
    },
    {
      key: "customer_name",
      header: "Client",
      render: (r: Invoice) => <span className="text-xs">{r.customer_name ?? (r.customer_id ? `#${r.customer_id}` : "—")}</span>,
    },
    {
      key: "total",
      header: "Total",
      render: (r: Invoice) => (
        <span className="font-mono text-sm">
          {r.currency} {Number(r.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r: Invoice) => <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>,
    },
    {
      key: "created_at",
      header: "Created",
      render: (r: Invoice) => (
        <span className="text-xs text-gray-500">{format(new Date(r.created_at), "dd MMM yyyy")}</span>
      ),
    },
    {
      key: "due_date",
      header: "Due",
      render: (r: Invoice) => (
        <span className="text-xs text-gray-500">{r.due_date ? format(new Date(r.due_date), "dd MMM yyyy") : "—"}</span>
      ),
    },
    ...(!isCustomer ? [{
      key: "actions",
      header: "",
      render: (r: Invoice) => (
        <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
          <button
            title="Edit"
            onClick={() => setEditInvoice(r)}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {r.status === "draft" && (
            <Button size="sm" onClick={() => issueMut.mutate(r.id)} loading={issueMut.isPending}>
              <Send className="w-3.5 h-3.5" /> Issue
            </Button>
          )}
          {r.status === "issued" && (
            <Button size="sm" variant="secondary" onClick={() => paidMut.mutate(r.id)} loading={paidMut.isPending}>
              <CheckCircle className="w-3.5 h-3.5" /> Mark Paid
            </Button>
          )}
        </div>
      ),
    }] : []),
  ];

  return (
    <DashboardLayout title="Invoices">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-500">
            Invoices are auto-generated when a sample is received. Edit items and issue when ready.
          </p>
        </div>

        <Table<Invoice>
          columns={columns}
          data={invoices as Invoice[]}
          loading={isLoading}
          emptyMessage="No invoices yet."
          keyExtractor={(r) => r.id}
        />
      </div>

      {editInvoice && (
        <InvoiceEditModal
          invoice={editInvoice}
          onClose={() => setEditInvoice(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["invoices"] });
            setEditInvoice(null);
          }}
        />
      )}
    </DashboardLayout>
  );
}

function InvoiceEditModal({
  invoice,
  onClose,
  onSaved,
}: {
  invoice: Invoice;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<InvoiceItem[]>(invoice.items || []);
  const [vatRate, setVatRate] = useState(Number(invoice.vat_rate));
  const [dueDate, setDueDate] = useState(invoice.due_date ?? "");
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [error, setError] = useState("");

  const subtotal = items.reduce((s, i) => s + Number(i.total || 0), 0);
  const vatAmount = (subtotal * vatRate) / 100;
  const total = subtotal + vatAmount;

  const updateItem = (idx: number, patch: Partial<InvoiceItem>) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const merged = { ...it, ...patch };
        merged.total = Number(merged.quantity || 0) * Number(merged.unit_price || 0);
        return merged;
      })
    );
  };

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const addItem = () =>
    setItems((prev) => [...prev, { name: "", quantity: 1, unit_price: 0, total: 0 }]);

  const updateMut = useMutation({
    mutationFn: () =>
      invoicesApi.update(invoice.id, {
        items,
        vat_rate: vatRate,
        due_date: dueDate || undefined,
        notes: notes || undefined,
      } as Partial<Invoice>),
    onSuccess: onSaved,
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Failed to save invoice"),
  });

  const qc = useQueryClient();
  const issueMut = useMutation({
    mutationFn: () => invoicesApi.issue(invoice.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoices"] }); onSaved(); },
  });

  return (
    <Modal open title={`Invoice — ${invoice.invoice_number}`} onClose={onClose} size="xl">
      <div className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500">Sample:</span>{" "}
            <span className="font-medium">{invoice.sample_code ?? "—"}</span>
          </div>
          <div>
            <span className="text-gray-500">Client:</span>{" "}
            <span className="font-medium">{invoice.customer_name ?? "—"}</span>
          </div>
          <div>
            <span className="text-gray-500">Status:</span>{" "}
            <Badge variant={STATUS_VARIANT[invoice.status]}>{invoice.status}</Badge>
          </div>
          <div>
            <span className="text-gray-500">Currency:</span>{" "}
            <span className="font-medium">{invoice.currency}</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">Line Items</h3>
            <Button size="sm" variant="outline" onClick={addItem}><Plus className="w-3 h-3" /> Add Row</Button>
          </div>
          <table className="w-full text-sm border border-gray-200">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-2 py-1">Description</th>
                <th className="px-2 py-1 w-16">Qty</th>
                <th className="px-2 py-1 w-28">Unit Price</th>
                <th className="px-2 py-1 w-28 text-right">Total</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} className="border-t">
                  <td className="px-1 py-1">
                    <input className="w-full px-2 py-1 border rounded text-sm" value={it.name}
                      onChange={(e) => updateItem(idx, { name: e.target.value })} />
                  </td>
                  <td className="px-1 py-1">
                    <input type="number" min={0} step="0.01" className="w-full px-2 py-1 border rounded text-sm"
                      value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                  </td>
                  <td className="px-1 py-1">
                    <input type="number" min={0} step="0.01" className="w-full px-2 py-1 border rounded text-sm"
                      value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })} />
                  </td>
                  <td className="px-2 py-1 text-right font-mono">
                    {invoice.currency} {it.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-1 py-1">
                    <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="VAT Rate (%)" type="number" step="0.01" value={vatRate}
            onChange={(e) => setVatRate(Number(e.target.value))} />
          <Input label="Due Date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />

        <div className="flex justify-end">
          <div className="w-64 text-sm space-y-1">
            <div className="flex justify-between"><span>Subtotal</span><span>{invoice.currency} {subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>VAT ({vatRate}%)</span><span>{invoice.currency} {vatAmount.toFixed(2)}</span></div>
            <div className="flex justify-between font-bold border-t pt-1"><span>Total</span><span>{invoice.currency} {total.toFixed(2)}</span></div>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2 border-t">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" onClick={() => updateMut.mutate()} loading={updateMut.isPending}>Save Draft</Button>
          {invoice.status === "draft" && (
            <Button onClick={() => issueMut.mutate()} loading={issueMut.isPending}>
              <Send className="w-3.5 h-3.5" /> Issue Invoice
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
