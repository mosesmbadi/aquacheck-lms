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
  report_show_who: z.boolean().optional(),
  report_hide_remarks: z.boolean().optional(),
});

export type CustomerFormData = {
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  organization_type?: string;
  currency?: string;
  report_show_who?: boolean;
  report_hide_remarks?: boolean;
};

interface CustomerFormProps {
  onSubmit: (data: CustomerFormData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  initialValues?: Partial<CustomerFormData>;
  submitLabel?: string;
}

export function CustomerForm({ onSubmit, onCancel, loading, initialValues, submitLabel }: CustomerFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      name: initialValues?.name ?? "",
      contact_person: initialValues?.contact_person ?? "",
      email: initialValues?.email ?? "",
      phone: initialValues?.phone ?? "",
      address: initialValues?.address ?? "",
      organization_type: initialValues?.organization_type ?? "",
      currency: initialValues?.currency ?? "KES",
      report_show_who: initialValues?.report_show_who ?? false,
      report_hide_remarks: initialValues?.report_hide_remarks ?? false,
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

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-700 mb-1">Test report layout</legend>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" className="mt-0.5" {...register("report_show_who")} />
          <span>Show W.H.O limits column <span className="text-gray-400">(international clients)</span></span>
        </label>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" className="mt-0.5" {...register("report_hide_remarks")} />
          <span>Hide the remarks column <span className="text-gray-400">(e.g. drillers)</span></span>
        </label>
      </fieldset>

      <div className="flex gap-3 justify-end pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={loading} disabled={!isValid}>
          {submitLabel ?? "Create Customer"}
        </Button>
      </div>
    </form>
  );
}