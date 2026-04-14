"use client";

import { useState } from "react";
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
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left text-gray-500">
                <th className="py-2">Test / Service</th>
                <th className="py-2">Unit</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Unit Price</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {q.items.map((it, idx) => (
                <tr key={idx} className="border-b">
                  <td className="py-2">{it.name}</td>
                  <td className="py-2">{it.unit ?? "—"}</td>
                  <td className="py-2 text-right">{it.quantity}</td>
                  <td className="py-2 text-right">{q.currency} {Number(it.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="py-2 text-right">{q.currency} {Number(it.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>

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
          {q.terms && (
            <div className="mt-3">
              <h3 className="font-semibold text-sm">Terms &amp; Conditions</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{q.terms}</p>
            </div>
          )}
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
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Failed to send email"),
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
