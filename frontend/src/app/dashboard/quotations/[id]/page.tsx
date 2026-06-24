"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Download, Send, Share2, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea } from "@/components/ui/Input";
import { quotationsApi, customersApi } from "@/lib/api";
import { apiErrorMessage } from "@/lib/utils";
import type { Quotation, Customer } from "@/lib/types";

const statusVariant: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  draft: "default",
  sent: "info",
  accepted: "success",
  rejected: "danger",
  expired: "warning",
};

export default function QuotationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const qc = useQueryClient();

  const [showSend, setShowSend] = useState(false);
  const [editingTerms, setEditingTerms] = useState(false);
  const [termsText, setTermsText] = useState("");
  const [error, setError] = useState("");

  const { data: quote, isLoading } = useQuery({
    queryKey: ["quotation", id],
    queryFn: () => quotationsApi.get(id).then((r) => r.data),
  });

  const { data: customer } = useQuery({
    queryKey: ["customer", quote?.customer_id],
    queryFn: () => customersApi.get(quote!.customer_id).then((r) => r.data),
    enabled: !!quote,
  });

  const deleteMut = useMutation({
    mutationFn: () => quotationsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotations"] });
      router.push("/dashboard/quotations");
    },
  });

  const updateTermsMut = useMutation({
    mutationFn: (terms: string) => quotationsApi.update(id, { terms }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotation", id] });
      setEditingTerms(false);
    },
    onError: () => setError("Failed to save terms."),
  });

  if (isLoading || !quote) {
    return (
      <DashboardLayout title="Quotation">
        <div className="text-center py-20 text-gray-400">Loading…</div>
      </DashboardLayout>
    );
  }

  const q = quote as Quotation;
  const c = customer as Customer | undefined;

  return (
    <DashboardLayout title="Quotation">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/quotations")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-mono">{q.quote_number}</h1>
            <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
              <Badge variant={statusVariant[q.status] ?? "default"}>{q.status}</Badge>
              <span>Created {format(new Date(q.created_at), "dd MMM yyyy")}</span>
              {q.sent_at && <span>· Sent {format(new Date(q.sent_at), "dd MMM yyyy HH:mm")}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => quotationsApi.downloadPdf(q.id, q.quote_number)}
          >
            <Download className="w-4 h-4 mr-1" /> PDF
          </Button>
          <Button onClick={() => setShowSend(true)}>
            <Send className="w-4 h-4 mr-1" /> Send to Customer
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (confirm(`Delete quotation ${q.quote_number}?`)) deleteMut.mutate();
            }}
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-white border rounded-lg p-6">
          <h2 className="font-semibold mb-3">Line Items</h2>
          <QuotationItemsTable items={q.items} currency={q.currency} />

          <div className="flex justify-end mt-4">
            <div className="w-64 text-sm space-y-1">
              <div className="flex justify-between"><span>Subtotal</span><span>{q.currency} {Number(q.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between"><span>VAT ({q.vat_rate}%)</span><span>{q.currency} {Number(q.vat_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between font-bold border-t pt-1"><span>Total</span><span>{q.currency} {Number(q.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
            </div>
          </div>

          {q.notes && (
            <div className="mt-4">
              <h3 className="font-semibold text-sm">Notes</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{q.notes}</p>
            </div>
          )}
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Terms &amp; Conditions</h3>
              {!editingTerms && (
                <button
                  onClick={() => { setTermsText(q.terms ?? ""); setEditingTerms(true); }}
                  className="text-xs text-primary-600 hover:text-primary-700 underline"
                >
                  {q.terms ? "Edit" : "Add terms"}
                </button>
              )}
            </div>
            {editingTerms ? (
              <div className="mt-2 space-y-2">
                <textarea
                  value={termsText}
                  onChange={(e) => setTermsText(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none"
                  placeholder="Enter terms and conditions…"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditingTerms(false)} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-300 rounded-lg">Cancel</button>
                  <button
                    onClick={() => updateTermsMut.mutate(termsText)}
                    disabled={updateTermsMut.isPending}
                    className="text-xs text-white bg-primary-600 hover:bg-primary-700 px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {updateTermsMut.isPending ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            ) : q.terms ? (
              <p className="text-sm text-gray-600 whitespace-pre-wrap mt-1">{q.terms}</p>
            ) : (
              <p className="text-xs text-gray-400 italic mt-1">No terms and conditions set.</p>
            )}
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6 space-y-3 h-fit">
          <h2 className="font-semibold">Customer</h2>
          <div className="text-sm">
            <p className="font-medium">{q.customer_name ?? c?.name}</p>
            {c?.contact_person && <p className="text-gray-500">{c.contact_person}</p>}
            {c?.email && <p className="text-gray-500">{c.email}</p>}
            {c?.phone && <p className="text-gray-500">{c.phone}</p>}
            {c?.address && <p className="text-gray-500">{c.address}</p>}
          </div>
          {q.valid_until && (
            <div className="pt-3 border-t text-sm">
              <p className="text-gray-500">Valid until</p>
              <p className="font-medium">{format(new Date(q.valid_until), "dd MMM yyyy")}</p>
            </div>
          )}
          {q.sent_to && (
            <div className="pt-3 border-t text-sm">
              <p className="text-gray-500">Last sent to</p>
              <p className="font-medium break-all">{q.sent_to}</p>
            </div>
          )}
        </div>
      </div>

      {showSend && (
        <SendQuotationModal
          quote={q}
          customer={c}
          onClose={() => setShowSend(false)}
          onSent={() => {
            qc.invalidateQueries({ queryKey: ["quotation", id] });
            qc.invalidateQueries({ queryKey: ["quotations"] });
            setShowSend(false);
          }}
        />
      )}
      {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
    </DashboardLayout>
  );
}

function QuotationItemsTable({ items, currency }: { items: import("@/lib/types").QuotationItem[]; currency: string }) {
  const packageItems = items.filter((i) => i.package_id);
  const individualItems = items.filter((i) => !i.package_id);

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2 });

  return (
    <table className="w-full text-sm">
      <thead className="border-b">
        <tr className="text-left text-gray-500 text-xs uppercase tracking-wide">
          <th className="py-2 font-medium">Test / Service</th>
          <th className="py-2 font-medium text-right w-12">Qty</th>
          <th className="py-2 font-medium text-right w-36">Unit Price</th>
          <th className="py-2 font-medium text-right w-36">Total</th>
        </tr>
      </thead>
      <tbody>
        {/* Individual (non-package) items */}
        {individualItems.map((it, idx) => (
          <tr key={`ind-${idx}`} className="border-b hover:bg-gray-50/50">
            <td className="py-2 text-gray-800">{it.name}</td>
            <td className="py-2 text-right text-gray-600">{it.quantity}</td>
            <td className="py-2 text-right font-mono text-gray-700">{currency} {fmt(Number(it.unit_price))}</td>
            <td className="py-2 text-right font-mono font-medium">{currency} {fmt(Number(it.total))}</td>
          </tr>
        ))}

        {/* Package items — one priced row + constituent tests as sub-rows */}
        {packageItems.map((it, idx) => {
          const physio = (it.included_tests ?? []).filter((t) => t.category === "physicochemical");
          const micro = (it.included_tests ?? []).filter((t) => t.category === "microbiological");
          const other = (it.included_tests ?? []).filter((t) => !t.category || (t.category !== "physicochemical" && t.category !== "microbiological"));
          const allTests = it.included_tests ?? [];

          return (
            <React.Fragment key={`pkg-${idx}`}>
              {/* Package header row — shows the single priced line */}
              <tr className="border-b bg-primary-50 border-primary-100">
                <td className="py-2.5 pl-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold bg-primary-600 text-white px-1.5 py-0.5 rounded uppercase tracking-wide">Package</span>
                    <span className="font-semibold text-primary-900">{it.name}</span>
                    <span className="text-xs text-primary-500">· {allTests.length} test{allTests.length !== 1 ? "s" : ""} included</span>
                  </div>
                </td>
                <td className="py-2.5 text-right text-primary-700">{it.quantity}</td>
                <td className="py-2.5 text-right font-mono text-primary-700">{currency} {fmt(Number(it.unit_price))}</td>
                <td className="py-2.5 text-right font-mono font-bold text-primary-900">{currency} {fmt(Number(it.total))}</td>
              </tr>

              {/* Constituent tests — grouped by category */}
              {physio.length > 0 && (
                <>
                  <tr className="bg-blue-50/60 border-b border-blue-100">
                    <td colSpan={4} className="py-1 pl-6 text-[10px] font-bold text-blue-600 uppercase tracking-widest">
                      Physio-Chemical Tests
                    </td>
                  </tr>
                  {physio.map((t, ti) => (
                    <tr key={`pc-${ti}`} className="border-b border-blue-50 bg-blue-50/20 hover:bg-blue-50/40">
                      <td className="py-1 pl-10 text-xs text-gray-600">{t.name}</td>
                      <td colSpan={3} className="py-1 text-right text-[10px] text-gray-400 pr-2">included in package</td>
                    </tr>
                  ))}
                </>
              )}
              {micro.length > 0 && (
                <>
                  <tr className="bg-green-50/60 border-b border-green-100">
                    <td colSpan={4} className="py-1 pl-6 text-[10px] font-bold text-green-600 uppercase tracking-widest">
                      Microbiological Tests
                    </td>
                  </tr>
                  {micro.map((t, ti) => (
                    <tr key={`mb-${ti}`} className="border-b border-green-50 bg-green-50/20 hover:bg-green-50/40">
                      <td className="py-1 pl-10 text-xs text-gray-600">{t.name}</td>
                      <td colSpan={3} className="py-1 text-right text-[10px] text-gray-400 pr-2">included in package</td>
                    </tr>
                  ))}
                </>
              )}
              {other.map((t, ti) => (
                <tr key={`oth-${ti}`} className="border-b border-gray-50 bg-gray-50/30">
                  <td className="py-1 pl-10 text-xs text-gray-600">{t.name}</td>
                  <td colSpan={3} className="py-1 text-right text-[10px] text-gray-400 pr-2">included in package</td>
                </tr>
              ))}

              {/* Spacer after package block */}
              <tr className="h-1 bg-white"><td colSpan={4} /></tr>
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function SendQuotationModal({
  quote,
  customer,
  onClose,
  onSent,
}: {
  quote: Quotation;
  customer?: Customer;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState<string>(customer?.email ?? "");
  const [subject, setSubject] = useState<string>(`Quotation ${quote.quote_number} from AquaCheck Laboratories`);
  const [message, setMessage] = useState<string>(
    `Dear ${customer?.contact_person || customer?.name || "Customer"},\n\n` +
    `Please find attached our quotation ${quote.quote_number}.\n\n` +
    `Total: ${quote.currency} ${Number(quote.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}\n\n` +
    `Regards,\nAquaCheck Laboratories Ltd`
  );
  const [error, setError] = useState<string>("");

  const sendMut = useMutation({
    mutationFn: () =>
      quotationsApi.send(quote.id, {
        to: to.split(",").map((e) => e.trim()).filter(Boolean),
        subject,
        message,
      }),
    onSuccess: onSent,
    onError: (e: unknown) => setError(apiErrorMessage(e, "Failed to send email")),
  });

  return (
    <Modal open={true} title="Send Quotation" onClose={onClose} size="lg">
      <div className="space-y-3">
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
        <Input
          label="To (comma-separated)"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="customer@example.com"
        />
        <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea label="Message" rows={8} value={message} onChange={(e) => setMessage(e.target.value)} />
        <div className="text-xs text-gray-500">The quotation PDF will be attached automatically.</div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => sendMut.mutate()} disabled={sendMut.isPending || !to.trim()}>
            <Send className="w-4 h-4 mr-1" />
            {sendMut.isPending ? "Sending…" : "Send Email"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
