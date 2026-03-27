"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { ComplaintStatusBadge } from "@/components/ui/Badge";
import { ComplaintForm } from "@/components/forms/ComplaintForm";
import { complaintsApi } from "@/lib/api";
import type { Complaint } from "@/lib/types";

export default function ComplaintsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");

  const { data: complaints = [], isLoading } = useQuery({
    queryKey: ["complaints"],
    queryFn: () => complaintsApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Complaint>) => complaintsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["complaints"] }); setShowCreate(false); },
  });

  const investigateMutation = useMutation({
    mutationFn: (id: number) => complaintsApi.investigate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["complaints"] }),
  });

  const closeMutation = useMutation({
    mutationFn: (id: number) => complaintsApi.close(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["complaints"] }),
  });

  const filtered = complaints.filter((c) =>
    !search || c.complaint_number.toLowerCase().includes(search.toLowerCase()) ||
    c.description.toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    { key: "complaint_number", header: "Complaint #", render: (r: Complaint) => <span className="font-mono font-medium text-primary-600">{r.complaint_number}</span> },
    { key: "customer_id", header: "Customer", render: (r: Complaint) => <span className="text-gray-500">#{r.customer_id}</span> },
    { key: "description", header: "Description", render: (r: Complaint) => <span className="max-w-xs truncate block text-sm text-gray-700">{r.description}</span> },
    { key: "reported_by", header: "Reported By", render: (r: Complaint) => <span className="text-gray-600 text-xs">{r.reported_by ?? "—"}</span> },
    { key: "status", header: "Status", render: (r: Complaint) => <ComplaintStatusBadge status={r.status} /> },
    { key: "received_at", header: "Received", render: (r: Complaint) => <span className="text-gray-500 text-xs">{format(new Date(r.received_at), "MMM d, yyyy")}</span> },
    {
      key: "actions", header: "Actions",
      render: (r: Complaint) => (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {r.status === "received" && (
            <Button size="sm" variant="secondary" onClick={() => investigateMutation.mutate(r.id)} loading={investigateMutation.isPending}>
              Investigate
            </Button>
          )}
          {r.status !== "closed" && (
            <Button size="sm" variant="danger" onClick={() => closeMutation.mutate(r.id)} loading={closeMutation.isPending}>
              Close
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout title="Complaints">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search complaints..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none" />
          </div>
          <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" />Submit Complaint</Button>
        </div>

        <Table columns={columns as never} data={filtered as never} loading={isLoading} emptyMessage="No complaints filed." keyExtractor={(r) => (r as unknown as Complaint).id} />
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Submit Complaint" size="lg">
        <ComplaintForm
          onSubmit={async (data) => { await createMutation.mutateAsync(data as Partial<Complaint>); }}
          onCancel={() => setShowCreate(false)}
          loading={createMutation.isPending}
        />
      </Modal>
    </DashboardLayout>
  );
}
