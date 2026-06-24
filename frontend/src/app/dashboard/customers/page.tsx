"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { customersApi } from "@/lib/api";
import type { Customer } from "@/lib/types";
import { CustomerForm, type CustomerFormData } from "@/components/forms/CustomerForm";
import { getCurrentUser } from "@/lib/auth";

export default function CustomersPage() {
  const qc = useQueryClient();
  const currentUser = getCurrentUser();
  const isCustomer = currentUser?.role === "customer";

  const [showCreate, setShowCreate] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: () => customersApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: CustomerFormData) => customersApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); setShowCreate(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: CustomerFormData }) => customersApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); setEditCustomer(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });

  const filtered = customers.filter((customer) => {
    const matchSearch =
      !search ||
      customer.name.toLowerCase().includes(search.toLowerCase()) ||
      (customer.contact_person ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (customer.email ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      !statusFilter ||
      (statusFilter === "active" && customer.is_active) ||
      (statusFilter === "inactive" && !customer.is_active);
    return matchSearch && matchStatus;
  });

  const columns = [
    {
      key: "name",
      header: "Customer",
      render: (row: Customer) => <span className="font-medium text-gray-900">{row.name}</span>,
    },
    {
      key: "contact_person",
      header: "Contact Person",
      render: (row: Customer) => <span className="text-gray-600">{row.contact_person ?? "—"}</span>,
    },
    {
      key: "email",
      header: "Email",
      render: (row: Customer) => <span className="text-gray-600">{row.email ?? "—"}</span>,
    },
    {
      key: "phone",
      header: "Phone",
      render: (row: Customer) => <span className="text-gray-600">{row.phone ?? "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row: Customer) => (
        <Badge variant={row.is_active ? "success" : "gray"}>
          {row.is_active ? "active" : "inactive"}
        </Badge>
      ),
    },
    {
      key: "created_at",
      header: "Created",
      render: (row: Customer) => (
        <span className="text-gray-500 text-xs">{format(new Date(row.created_at), "MMM d, yyyy")}</span>
      ),
    },
    ...(!isCustomer ? [{
      key: "actions",
      header: "",
      render: (row: Customer) => (
        <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setEditCustomer(row)}
            className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded"
            title="Edit customer"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (confirm(`Deactivate customer "${row.name}"? They will no longer appear in active lists.`))
                deleteMutation.mutate(row.id);
            }}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            title="Deactivate customer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    }] : []),
  ];

  return (
    <DashboardLayout title="Customers">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex gap-3 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search customers..."
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
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {!isCustomer && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" />
              New Customer
            </Button>
          )}
        </div>

        <Table<Customer>
          columns={columns}
          data={filtered}
          loading={isLoading}
          emptyMessage="No customers found."
          keyExtractor={(row) => row.id}
        />
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Customer" size="lg">
        <CustomerForm
          onSubmit={async (data) => { await createMutation.mutateAsync(data); }}
          onCancel={() => setShowCreate(false)}
          loading={createMutation.isPending}
        />
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editCustomer} onClose={() => setEditCustomer(null)} title={`Edit Customer — ${editCustomer?.name ?? ""}`} size="lg">
        {editCustomer && (
          <CustomerForm
            initialValues={editCustomer}
            submitLabel="Save Changes"
            onSubmit={async (data) => { await updateMutation.mutateAsync({ id: editCustomer.id, data }); }}
            onCancel={() => setEditCustomer(null)}
            loading={updateMutation.isPending}
          />
        )}
      </Modal>
    </DashboardLayout>
  );
}
