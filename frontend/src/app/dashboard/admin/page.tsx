"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ToggleLeft, ToggleRight } from "lucide-react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { usersApi, authApi } from "@/lib/api";
import type { User, UserRole } from "@/lib/types";
import { getCurrentUser } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  email: z.string().email("Valid email required"),
  full_name: z.string().min(2, "Full name required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["admin", "manager", "technician", "quality_manager", "customer", "auditor"] as const),
});
type FormData = z.infer<typeof schema>;

export default function AdminPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const currentUser = getCurrentUser();

  // Redirect if not admin
  if (currentUser && currentUser.role !== "admin") {
    return (
      <DashboardLayout title="Admin">
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Access restricted to administrators.</p>
        </div>
      </DashboardLayout>
    );
  }

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => usersApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: { email: string; password: string; full_name: string; role: UserRole }) =>
      authApi.register(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setShowCreate(false); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      usersApi.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({ resolver: zodResolver(schema) });

  const columns = [
    { key: "full_name", header: "Name", render: (r: User) => <span className="font-medium text-gray-900">{r.full_name}</span> },
    { key: "email", header: "Email", render: (r: User) => <span className="text-gray-600 text-sm">{r.email}</span> },
    { key: "role", header: "Role", render: (r: User) => <Badge variant="info" className="capitalize">{r.role.replace("_", " ")}</Badge> },
    { key: "is_active", header: "Active", render: (r: User) => r.is_active
      ? <span className="text-green-600 font-medium text-xs">Active</span>
      : <span className="text-gray-400 text-xs">Inactive</span>
    },
    { key: "created_at", header: "Created", render: (r: User) => <span className="text-gray-500 text-xs">{format(new Date(r.created_at), "MMM d, yyyy")}</span> },
    {
      key: "actions", header: "Toggle",
      render: (r: User) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); toggleMutation.mutate({ id: r.id, is_active: !r.is_active }); }}
          loading={toggleMutation.isPending}
        >
          {r.is_active ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout title="User Administration">
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" />Add User</Button>
        </div>
        <Table columns={columns as never} data={users as never} loading={isLoading} emptyMessage="No users found." keyExtractor={(r) => (r as unknown as User).id} />
      </div>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); }} title="Add User" size="md">
        <form onSubmit={handleSubmit(async (data) => { await createMutation.mutateAsync(data); reset(); })} className="space-y-4">
          <Input label="Full Name" error={errors.full_name?.message} {...register("full_name")} placeholder="Jane Doe" />
          <Input label="Email" type="email" error={errors.email?.message} {...register("email")} placeholder="jane@aquacheck.com" />
          <Input label="Password" type="password" error={errors.password?.message} {...register("password")} placeholder="Min. 6 characters" />
          <Select label="Role" error={errors.role?.message} {...register("role")}>
            <option value="technician">Technician</option>
            <option value="manager">Manager</option>
            <option value="quality_manager">Quality Manager</option>
            <option value="auditor">Auditor</option>
            <option value="customer">Customer</option>
            <option value="admin">Admin</option>
          </Select>
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => { setShowCreate(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Create User</Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
