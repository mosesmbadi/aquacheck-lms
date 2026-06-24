"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { customersApi } from "@/lib/api";
import { CustomerForm, type CustomerFormData } from "./CustomerForm";

const schema = z.object({
  customer_id: z.coerce.number().min(1, "Select a customer"),
  title: z.string().min(2, "Title is required"),
  scope_of_work: z.string().optional(),
  decision_rules: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface ContractFormProps {
  onSubmit: (data: FormData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function ContractForm({ onSubmit, onCancel, loading }: ContractFormProps) {
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const qc = useQueryClient();
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => customersApi.list().then((r) => r.data),
  });

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isValid },
  } = useForm<FormData>({ resolver: zodResolver(schema), mode: "onChange" });

  const createCustomerMutation = useMutation({
    mutationFn: (data: CustomerFormData) => customersApi.create(data),
    onSuccess: (response) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      setValue("customer_id", response.data.id, { shouldValidate: true, shouldDirty: true });
      setShowCustomerModal(false);
    },
  });

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Select label="Customer" error={errors.customer_id?.message} {...register("customer_id")}>
            <option value="">Select customer...</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-600">
              {customers.length === 0
                ? "No customers exist yet. Create one before saving the contract."
                : "Customer missing from the list? Add it here without leaving this form."}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowCustomerModal(true)}>
              <Plus className="w-3.5 h-3.5" />
              New Customer
            </Button>
          </div>
        </div>

        <Input label="Contract Title" error={errors.title?.message} {...register("title")} placeholder="e.g. Water Quality Testing Q1 2024" />

        <Textarea
          label="Scope of Work"
          error={errors.scope_of_work?.message}
          {...register("scope_of_work")}
          rows={3}
          placeholder="Describe the scope of testing work..."
        />

        <Textarea
          label="Decision Rules"
          error={errors.decision_rules?.message}
          {...register("decision_rules")}
          rows={2}
          placeholder="Specify decision rules (e.g. pass/fail criteria)..."
        />

        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={loading} disabled={!isValid}>
            Create Contract
          </Button>
        </div>
      </form>

      <Modal open={showCustomerModal} onClose={() => setShowCustomerModal(false)} title="New Customer" size="lg">
        <CustomerForm
          onSubmit={async (data) => {
            await createCustomerMutation.mutateAsync(data);
          }}
          onCancel={() => setShowCustomerModal(false)}
          loading={createCustomerMutation.isPending}
        />
      </Modal>
    </>
  );
}
