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
import { Textarea } from "@/components/ui/Input";
import { ComplaintForm } from "@/components/forms/ComplaintForm";
import { complaintsApi } from "@/lib/api";
import type { Complaint } from "@/lib/types";
import { getCurrentUser } from "@/lib/auth";

export default function ComplaintsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [closeTarget, setCloseTarget] = useState<Complaint | null>(null);
  const [correctiveAction, setCorrectiveAction] = useState("");
  const currentUser = getCurrentUser();
  const isCustomer = currentUser?.role === "customer";

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
    mutationFn: ({ id, corrective_action }: { id: number; corrective_action?: string }) =>
      complaintsApi.close(id, corrective_action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["complaints"] });
      setCloseTarget(null);
      setCorrectiveAction("");
    },
  });

  const filtered = complaints.filter((c) =>
    !search ||
    c.complaint_number.toLowerCase().includes(search.toLowerCase()) ||
    c.description.toLowerCase().includes(search.toLowerCase())
  );

  const categoryLabel = (cat?: string) => {
    if (cat === "feedback") return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Feedback</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Complaint</span>;
  };

  const columns = [
    { key: "complaint_number", header: "Ref #", render: (r: Complaint) => <span className="font-mono font-medium text-primary-600">{r.complaint_number}</span> },
    { key: "category", header: "Type", render: (r: Complaint) => categoryLabel(r.category) },
    { key: "customer_id", header: "Customer", render: (r: Complaint) => <span className="text-gray-500 text-xs">#{r.customer_id}</span> },
    { key: "description", header: "Description", render: (r: Complaint) => <span className="max-w-xs truncate block text-sm text-gray-700">{r.description}</span> },
    { key: "reported_by", header: "Reported By", render: (r: Complaint) => <span className="text-gray-600 text-xs">{r.reported_by ?? "—"}</span> },
    { key: "status", header: "Status", render: (r: Complaint) => <ComplaintStatusBadge status={r.status} /> },
    { key: "received_at", header: "Received", render: (r: Complaint) => <span className="text-gray-500 text-xs">{format(new Date(r.received_at), "MMM d, yyyy")}</span> },
    {
      key: "actions", header: "Actions",
      render: (r: Complaint) => (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {!isCustomer && r.status === "received" && (
            <Button size="sm" variant="secondary" onClick={() => investigateMutation.mutate(r.id)} loading={investigateMutation.isPending}>
              Investigate
            </Button>
          )}
          {!isCustomer && r.status !== "closed" && (
            <Button size="sm" variant="danger" onClick={() => { setCloseTarget(r); setCorrectiveAction(""); }}>
              Close
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout title="Complaints & Feedback">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search complaints..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none" />
          </div>
          <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" />Submit</Button>
        </div>

        <Table<Complaint> columns={columns} data={filtered} loading={isLoading} emptyMessage="No complaints or feedback filed." keyExtractor={(r) => r.id} />
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Submit Complaint or Feedback" size="lg">
        <ComplaintForm
          onSubmit={async (data) => { await createMutation.mutateAsync(data as Partial<Complaint>); }}
          onCancel={() => setShowCreate(false)}
          loading={createMutation.isPending}
          customerId={isCustomer && currentUser?.customer_id ? currentUser.customer_id : undefined}
        />
      </Modal>

      {/* Close complaint modal — requires corrective action */}
      <Modal open={!!closeTarget} onClose={() => { setCloseTarget(null); setCorrectiveAction(""); }} title="Close Complaint" size="md">
        {closeTarget && (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-lg border text-sm">
              <p className="font-medium text-gray-700">{closeTarget.complaint_number}</p>
              <p className="text-gray-500 text-xs mt-1">{closeTarget.description}</p>
            </div>

            <Textarea
              label="Corrective Action / Actions Taken"
              rows={4}
              value={correctiveAction}
              onChange={(e) => setCorrectiveAction(e.target.value)}
              placeholder="Describe the corrective actions taken to resolve this complaint before closing..."
            />

            <div className="flex gap-3 justify-end pt-2 border-t">
              <Button variant="secondary" onClick={() => { setCloseTarget(null); setCorrectiveAction(""); }}>Cancel</Button>
              <Button
                variant="danger"
                loading={closeMutation.isPending}
                onClick={() => closeMutation.mutate({ id: closeTarget.id, corrective_action: correctiveAction || undefined })}
              >
                Close Complaint
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
