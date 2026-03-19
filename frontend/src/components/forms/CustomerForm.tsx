"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const schema = z.object({
  name: z.string().min(2, "Customer name is required"),
  contact_person: z.string().optional(),
  email: z.string().email("Enter a valid email address").or(z.literal("")).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  organization_type: z.string().optional(),
  currency: z.string().optional(),
});

export type CustomerFormData = {
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  organization_type?: string;
  currency?: string;
};

interface CustomerFormProps {
  onSubmit: (data: CustomerFormData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function CustomerForm({ onSubmit, onCancel, loading }: CustomerFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      contact_person: "",
      email: "",
      phone: "",
      address: "",
      organization_type: "",
      currency: "KES",
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input label="Customer Name" error={errors.name?.message} {...register("name")} placeholder="e.g. Nairobi Water Authority" />

      <div className="grid grid-cols-2 gap-4">
        <Input label="Contact Person" error={errors.contact_person?.message} {...register("contact_person")} placeholder="e.g. Jane Doe" />
        <Input label="Organization Type" error={errors.organization_type?.message} {...register("organization_type")} placeholder="e.g. Government, Private" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input label="Email" type="email" error={errors.email?.message} {...register("email")} placeholder="contact@example.com" />
        <Input label="Phone" error={errors.phone?.message} {...register("phone")} placeholder="+254 700 000000" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input label="Currency" error={errors.currency?.message} {...register("currency")} placeholder="KES" />
      </div>

      <Textarea label="Address" error={errors.address?.message} {...register("address")} rows={3} placeholder="Postal or physical address" />

      <div className="flex gap-3 justify-end pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={loading}>
          Create Customer
        </Button>
      </div>
    </form>
  );
}