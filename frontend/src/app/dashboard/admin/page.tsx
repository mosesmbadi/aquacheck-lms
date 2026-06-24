"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ToggleLeft, ToggleRight, Pencil, Upload, X } from "lucide-react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { usersApi, authApi, customersApi } from "@/lib/api";
import type { User, UserRole, Customer } from "@/lib/types";
import { getCurrentUser } from "@/lib/auth";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// ─── Create schema ────────────────────────────────────────────────────────────

const createSchema = z
  .object({
    email: z.string().email("Valid email required"),
    full_name: z.string().min(2, "Full name required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    role: z.enum(["admin", "manager", "technician", "quality_manager", "customer", "auditor"] as const),
    customer_id: z.coerce.number().optional(),
    is_contact_person: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.role === "customer" && !data.customer_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please select a customer", path: ["customer_id"] });
    }
  });

type CreateFormData = z.infer<typeof createSchema>;

// ─── Edit schema ──────────────────────────────────────────────────────────────

const editSchema = z.object({
  full_name: z.string().min(2, "Full name required"),
  job_title: z.string().optional(),
  role: z.enum(["admin", "manager", "technician", "quality_manager", "customer", "auditor"] as const),
  is_active: z.boolean(),
});

type EditFormData = z.infer<typeof editSchema>;

// ─── Signature resize helper ──────────────────────────────────────────────────

async function imageFileToBase64(file: File, size = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      const scale = Math.min(size / img.width, size / img.height);
      const x = (size - img.width * scale) / 2;
      const y = (size - img.height * scale) / 2;
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      resolve(canvas.toDataURL("image/png").split(",")[1]);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [pendingSignature, setPendingSignature] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentUser = getCurrentUser();

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

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => customersApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      email: string; password: string; full_name: string; role: UserRole;
      customer_id?: number; is_contact_person?: boolean;
    }) => authApi.register(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setShowCreate(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<User & { password: string }> }) =>
      usersApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); closeEdit(); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      usersApi.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  // ── Create form ──
  const { register: regCreate, handleSubmit: hsCreate, control: ctrlCreate, formState: { errors: errCreate, isValid: createIsValid }, reset: resetCreate } =
    useForm<CreateFormData>({ resolver: zodResolver(createSchema), mode: "onChange", defaultValues: { role: "technician", is_contact_person: false } });
  const selectedRole = useWatch({ control: ctrlCreate, name: "role" });

  // ── Edit form ──
  const { register: regEdit, handleSubmit: hsEdit, formState: { errors: errEdit, isValid: editIsValid }, reset: resetEdit } =
    useForm<EditFormData>({ resolver: zodResolver(editSchema), mode: "onChange" });

  const customerMap = new Map<number, Customer>(customers.map((c) => [c.id, c]));

  function openEdit(user: User) {
    setEditingUser(user);
    setPendingSignature(null);
    setSignatureError(null);
    resetEdit({
      full_name: user.full_name,
      job_title: user.job_title ?? "",
      role: user.role,
      is_active: user.is_active,
    });
  }

  function closeEdit() {
    setEditingUser(null);
    setPendingSignature(null);
    setSignatureError(null);
    resetEdit();
  }

  async function handleSignatureFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSignatureError("Please select an image file (PNG, JPG, etc.)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSignatureError("Image must be under 5 MB");
      return;
    }
    setSignatureError(null);
    try {
      const b64 = await imageFileToBase64(file);
      setPendingSignature(b64);
    } catch {
      setSignatureError("Failed to process image. Please try another file.");
    }
  }

  const currentSignature = pendingSignature ?? editingUser?.signature_b64 ?? null;

  const columns = [
    { key: "full_name", header: "Name", render: (r: User) => (
      <div>
        <span className="font-medium text-gray-900">{r.full_name}</span>
        {r.job_title && <div className="text-xs text-gray-400 italic">{r.job_title}</div>}
      </div>
    )},
    { key: "email", header: "Email", render: (r: User) => <span className="text-gray-600 text-sm">{r.email}</span> },
    { key: "role", header: "Role", render: (r: User) => <Badge variant="info" className="capitalize">{r.role.replace("_", " ")}</Badge> },
    {
      key: "customer", header: "Customer",
      render: (r: User) => r.customer_id
        ? <span className="text-sm text-gray-700">{customerMap.get(r.customer_id)?.name ?? `#${r.customer_id}`}{r.is_contact_person ? <span className="ml-1 text-xs text-primary-500">(Contact)</span> : null}</span>
        : <span className="text-gray-400 text-xs">—</span>,
    },
    { key: "signature", header: "Signature", render: (r: User) =>
      r.signature_b64
        ? <img src={`data:image/png;base64,${r.signature_b64}`} alt="sig" className="h-8 w-8 object-contain border border-gray-200 rounded bg-white" />
        : <span className="text-gray-300 text-xs">None</span>
    },
    { key: "is_active", header: "Active", render: (r: User) => r.is_active
      ? <span className="text-green-600 font-medium text-xs">Active</span>
      : <span className="text-gray-400 text-xs">Inactive</span>
    },
    { key: "created_at", header: "Created", render: (r: User) => <span className="text-gray-500 text-xs">{format(new Date(r.created_at), "MMM d, yyyy")}</span> },
    {
      key: "actions", header: "",
      render: (r: User) => (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" title="Edit user" onClick={(e) => { e.stopPropagation(); openEdit(r); }}>
            <Pencil className="w-4 h-4 text-gray-400" />
          </Button>
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); toggleMutation.mutate({ id: r.id, is_active: !r.is_active }); }} loading={toggleMutation.isPending}>
            {r.is_active ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout title="User Administration">
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" />Add User</Button>
        </div>
        <Table<User> columns={columns} data={users} loading={isLoading} emptyMessage="No users found." keyExtractor={(r) => r.id} />
      </div>

      {/* ── Add User modal ── */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); resetCreate(); }} title="Add User" size="md">
        <form
          onSubmit={hsCreate(async (data) => {
            const payload: Parameters<typeof authApi.register>[0] = {
              email: data.email, password: data.password, full_name: data.full_name, role: data.role,
            };
            if (data.role === "customer") {
              payload.customer_id = data.customer_id;
              payload.is_contact_person = data.is_contact_person;
            }
            await createMutation.mutateAsync(payload);
            resetCreate();
          })}
          className="space-y-4"
        >
          <Input label="Full Name" error={errCreate.full_name?.message} {...regCreate("full_name")} placeholder="Jane Doe" />
          <Input label="Email" type="email" error={errCreate.email?.message} {...regCreate("email")} placeholder="jane@aquacheck.com" />
          <Input label="Password" type="password" error={errCreate.password?.message} {...regCreate("password")} placeholder="Min. 6 characters" />
          <Select label="Role" error={errCreate.role?.message} {...regCreate("role")}>
            <option value="technician">Technician</option>
            <option value="manager">Manager</option>
            <option value="quality_manager">Quality Manager</option>
            <option value="auditor">Auditor</option>
            <option value="customer">Customer</option>
            <option value="admin">Admin</option>
          </Select>
          {selectedRole === "customer" && (
            <>
              <Select label="Customer" error={errCreate.customer_id?.message} {...regCreate("customer_id")}>
                <option value="">— Select customer —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" className="rounded border-gray-300" {...regCreate("is_contact_person")} />
                This user is the contact person for the customer
              </label>
            </>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => { setShowCreate(false); resetCreate(); }}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending} disabled={!createIsValid}>Create User</Button>
          </div>
        </form>
      </Modal>

      {/* ── Edit User modal ── */}
      <Modal open={!!editingUser} onClose={closeEdit} title="Edit User" size="md">
        {editingUser && (
          <form
            onSubmit={hsEdit(async (data) => {
              const payload: Partial<User> = {
                full_name: data.full_name,
                job_title: data.job_title || undefined,
                role: data.role,
                is_active: data.is_active,
              };
              if (pendingSignature !== null) {
                payload.signature_b64 = pendingSignature;
              }
              await updateMutation.mutateAsync({ id: editingUser.id, data: payload });
            })}
            className="space-y-4"
          >
            <Input label="Full Name" error={errEdit.full_name?.message} {...regEdit("full_name")} />
            <Input
              label="Job Title (appears on reports)"
              error={errEdit.job_title?.message}
              {...regEdit("job_title")}
              placeholder="e.g. Water Chemist, Lab Analyst"
            />
            <Select label="Role" error={errEdit.role?.message} {...regEdit("role")}>
              <option value="technician">Technician</option>
              <option value="manager">Manager</option>
              <option value="quality_manager">Quality Manager</option>
              <option value="auditor">Auditor</option>
              <option value="customer">Customer</option>
              <option value="admin">Admin</option>
            </Select>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" className="rounded border-gray-300" {...regEdit("is_active")} />
              Account is active
            </label>

            {/* Signature upload */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Signature Image</label>
              <div className="flex items-start gap-4">
                {/* Preview */}
                <div className="w-24 h-24 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center bg-gray-50 flex-shrink-0 overflow-hidden">
                  {currentSignature ? (
                    <img
                      src={`data:image/png;base64,${currentSignature}`}
                      alt="Signature preview"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-gray-400 text-center px-1">No signature</span>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleSignatureFile}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {currentSignature ? "Replace Signature" : "Upload Signature"}
                  </Button>
                  {currentSignature && (
                    <button
                      type="button"
                      onClick={() => { setPendingSignature(""); }}
                      className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                    >
                      <X className="w-3 h-3" /> Remove signature
                    </button>
                  )}
                  {signatureError && <p className="text-xs text-red-500">{signatureError}</p>}
                  <p className="text-xs text-gray-400">
                    PNG, JPG or GIF. Resized to 512×512 px. Used on printed reports.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <Button type="button" variant="secondary" onClick={closeEdit}>Cancel</Button>
              <Button type="submit" loading={updateMutation.isPending} disabled={!editIsValid}>Save Changes</Button>
            </div>
          </form>
        )}
      </Modal>
    </DashboardLayout>
  );
}
