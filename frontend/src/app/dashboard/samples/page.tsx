"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, QrCode } from "lucide-react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { SampleStatusBadge } from "@/components/ui/Badge";
import { SampleForm } from "@/components/forms/SampleForm";
import { samplesApi } from "@/lib/api";
import type { Sample } from "@/lib/types";

export default function SamplesPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [barcodeModal, setBarcodeModal] = useState<{ code: string; b64: string } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data: samples = [], isLoading } = useQuery({
    queryKey: ["samples"],
    queryFn: () => samplesApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Sample>) => samplesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["samples"] });
      setShowCreate(false);
    },
  });

  const handleBarcode = async (id: number) => {
    const res = await samplesApi.barcode(id);
    setBarcodeModal({ code: res.data.sample_code, b64: res.data.barcode_base64 });
  };

  const filtered = samples.filter((s) => {
    const matchSearch =
      !search ||
      s.sample_code.toLowerCase().includes(search.toLowerCase()) ||
      (s.sample_type ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const columns = [
    { key: "sample_code", header: "Sample Code", render: (r: Sample) => <span className="font-mono font-medium text-primary-600">{r.sample_code}</span> },
    { key: "sample_type", header: "Type", render: (r: Sample) => <span>{r.sample_type ?? "—"}</span> },
    { key: "contract_id", header: "Contract", render: (r: Sample) => <span className="text-gray-500">#{r.contract_id}</span> },
    { key: "status", header: "Status", render: (r: Sample) => <SampleStatusBadge status={r.status} /> },
    { key: "storage_condition", header: "Storage", render: (r: Sample) => <span className="text-gray-600 text-xs">{r.storage_condition ?? "—"}</span> },
    { key: "received_at", header: "Received", render: (r: Sample) => <span className="text-gray-500 text-xs">{format(new Date(r.received_at), "MMM d, yyyy")}</span> },
    {
      key: "actions",
      header: "QR",
      render: (r: Sample) => (
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleBarcode(r.id); }}>
          <QrCode className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout title="Samples">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex gap-3 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search samples..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-primary-400 outline-none bg-white"
            >
              <option value="">All Statuses</option>
              {["received", "registered", "assigned", "in_testing", "completed", "archived", "disposed"].map((s) => (
                <option key={s} value={s}>{s.replace("_", " ")}</option>
              ))}
            </select>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />
            Register Sample
          </Button>
        </div>

        <Table
          columns={columns as never}
          data={filtered as never}
          loading={isLoading}
          emptyMessage="No samples registered."
          keyExtractor={(r) => (r as unknown as Sample).id}
        />
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Register Sample" size="lg">
        <SampleForm
          onSubmit={async (data) => { await createMutation.mutateAsync(data as Partial<Sample>); }}
          onCancel={() => setShowCreate(false)}
          loading={createMutation.isPending}
        />
      </Modal>

      <Modal open={!!barcodeModal} onClose={() => setBarcodeModal(null)} title="Sample QR Code" size="sm">
        {barcodeModal && (
          <div className="flex flex-col items-center gap-4 py-2">
            <p className="font-mono text-lg font-bold text-primary-600">{barcodeModal.code}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:image/png;base64,${barcodeModal.b64}`} alt="QR Code" className="w-48 h-48" />
            <p className="text-xs text-gray-500">Scan to identify sample</p>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
