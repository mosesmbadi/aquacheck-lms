"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { ContractStatusBadge } from "@/components/ui/Badge";
import { ContractForm } from "@/components/forms/ContractForm";
import { contractsApi, customersApi } from "@/lib/api";
import type { Contract, Customer } from "@/lib/types";

export default function ContractsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["contracts"],
    queryFn: () => contractsApi.list().then((r) => r.data),
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => customersApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Contract>) => contractsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
      setShowModal(false);
    },
  });

  const reviewMutation = useMutation({
    mutationFn: (id: number) => contractsApi.review(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contracts"] }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => contractsApi.approve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contracts"] }),
  });

  const filtered = contracts.filter((c) => {
    const matchSearch =
      !search ||
      c.contract_number.toLowerCase().includes(search.toLowerCase()) ||
      c.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const customerNameById = new Map<number, string>(customers.map((customer: Customer) => [customer.id, customer.name]));

  const columns = [
    { key: "contract_number", header: "Contract #", render: (r: Contract) => <span className="font-mono font-medium text-primary-600">{r.contract_number}</span> },
    {
      key: "customer_id",
      header: "Customer",
      render: (r: Contract) => <span className="text-gray-600">{customerNameById.get(r.customer_id) ?? `#${r.customer_id}`}</span>,
    },
    { key: "title", header: "Title", render: (r: Contract) => <span className="max-w-xs truncate block">{r.title}</span> },
    { key: "status", header: "Status", render: (r: Contract) => <ContractStatusBadge status={r.status} /> },
    { key: "created_at", header: "Created", render: (r: Contract) => <span className="text-gray-500 text-xs">{format(new Date(r.created_at), "MMM d, yyyy")}</span> },
    {
      key: "actions",
      header: "Actions",
      render: (r: Contract) => (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {r.status === "draft" && (
            <Button size="sm" variant="secondary" onClick={() => reviewMutation.mutate(r.id)} loading={reviewMutation.isPending}>
              Review
            </Button>
          )}
          {r.status === "under_review" && (
            <Button size="sm" onClick={() => approveMutation.mutate(r.id)} loading={approveMutation.isPending}>
              Approve
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout title="Contracts">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex gap-3 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search contracts..."
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
              <option value="draft">Draft</option>
              <option value="under_review">Under Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <Button onClick={() => setShowModal(true)}>
            <Plus className="w-4 h-4" />
            New Contract
          </Button>
        </div>

        <Table
          columns={columns as never}
          data={filtered as never}
          loading={isLoading}
          emptyMessage="No contracts found."
          keyExtractor={(r) => (r as unknown as Contract).id}
        />
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Contract" size="lg">
        <ContractForm
          onSubmit={async (data) => { await createMutation.mutateAsync(data as Partial<Contract>); }}
          onCancel={() => setShowModal(false)}
          loading={createMutation.isPending}
        />
      </Modal>
    </DashboardLayout>
  );
}
