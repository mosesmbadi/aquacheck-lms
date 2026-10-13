"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Receipt, FlaskConical, Microscope, ClipboardList, FileSpreadsheet, ChevronRight } from "lucide-react";
import { invoicesApi, quotationsApi, reportsApi, samplesApi } from "@/lib/api";
import type { Sample } from "@/lib/types";

// Samples whose results are still being entered or validated.
const IN_LAB_STATUSES = new Set(["received", "registered", "assigned", "in_testing"]);

interface Step {
  title: string;
  hint: string;
  href: string;
  icon: React.ElementType;
  /** Items waiting on this step; 0 means nothing to do here right now. */
  pending: number;
  pendingLabel: string;
  /** Up to a few items to jump straight to. */
  shortcuts?: { label: string; href: string }[];
}

/**
 * The lab's sample-to-invoice sequence, with what is waiting at each step, so staff can
 * see the next thing to do from the dashboard.
 */
export function WorkflowGuide() {
  const { data: quotations = [] } = useQuery({
    queryKey: ["quotations"],
    queryFn: () => quotationsApi.list().then((r) => r.data),
  });
  const { data: samples = [] } = useQuery({
    queryKey: ["samples"],
    queryFn: () => samplesApi.list().then((r) => r.data),
  });
  // Without include_pending the API lists a sample's report only once its results are
  // all validated, so every draft here is ready to issue.
  const { data: reports = [] } = useQuery({
    queryKey: ["reports"],
    queryFn: () => reportsApi.list().then((r) => r.data),
  });
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => invoicesApi.list().then((r) => r.data),
  });

  const draftQuotes = quotations.filter((q) => q.status === "draft").length;
  const inLab = (samples as Sample[])
    .filter((s) => IN_LAB_STATUSES.has(s.status))
    .sort((a, b) => a.received_at.localeCompare(b.received_at));
  const reportsToIssue = reports.filter((r) => r.status === "draft" || r.status === "under_review").length;
  const draftInvoices = invoices.filter((i) => i.status === "draft").length;
  const unpaidInvoices = invoices.filter((i) => i.status === "issued").length;

  const steps: Step[] = [
    {
      title: "Quote the customer",
      hint: "Add the customer if new, then prepare and send a quotation.",
      href: "/dashboard/quotations",
      icon: Receipt,
      pending: draftQuotes,
      pendingLabel: `${draftQuotes} draft quotation${draftQuotes === 1 ? "" : "s"} to send`,
    },
    {
      title: "Register the sample",
      hint: "On receipt, register the sample and its tests. A draft report and invoice are created for it.",
      href: "/dashboard/samples",
      icon: FlaskConical,
      pending: 0,
      pendingLabel: "",
    },
    {
      title: "Enter & validate results",
      hint: "Open the sample, enter each result, save, then validate. The sample completes once every test is validated.",
      href: "/dashboard/samples",
      icon: Microscope,
      pending: inLab.length,
      pendingLabel: `${inLab.length} sample${inLab.length === 1 ? "" : "s"} in testing`,
      shortcuts: inLab.slice(0, 3).map((s) => ({ label: s.sample_code, href: `/dashboard/samples/${s.id}` })),
    },
    {
      title: "Issue the report",
      hint: "Review the completed sample's report, then issue it to the customer.",
      href: "/dashboard/reports",
      icon: ClipboardList,
      pending: reportsToIssue,
      pendingLabel: `${reportsToIssue} report${reportsToIssue === 1 ? "" : "s"} ready to issue`,
    },
    {
      title: "Invoice & payment",
      hint: "Issue the sample's invoice and mark it paid once payment is received.",
      href: "/dashboard/invoices",
      icon: FileSpreadsheet,
      pending: draftInvoices + unpaidInvoices,
      pendingLabel: [
        draftInvoices && `${draftInvoices} to issue`,
        unpaidInvoices && `${unpaidInvoices} awaiting payment`,
      ].filter(Boolean).join(" · "),
    },
  ];

  // The first step with work waiting is the suggested next step.
  const nextIndex = steps.findIndex((s) => s.pending > 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h3 className="font-semibold text-gray-900 text-sm">Lab Workflow — Next Steps</h3>
        <Link href="/dashboard/settings/docs" className="text-xs text-primary-600 hover:text-primary-700">
          Full user guide
        </Link>
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const isNext = i === nextIndex;
          return (
            <li
              key={step.title}
              className={`relative flex flex-col rounded-lg border p-3 ${
                isNext ? "border-primary-400 bg-primary-50/60 ring-1 ring-primary-200" : "border-gray-200"
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    isNext ? "bg-primary-500 text-white" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {i + 1}
                </span>
                <Icon className="w-4 h-4 text-primary-500 flex-shrink-0" />
                <Link href={step.href} className="text-sm font-semibold text-gray-900 hover:text-primary-700 leading-tight">
                  {step.title}
                </Link>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed flex-1">{step.hint}</p>
              {step.pending > 0 && (
                <div className="mt-2 space-y-1">
                  <Link
                    href={step.href}
                    className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 hover:bg-amber-100"
                  >
                    {step.pendingLabel} <ChevronRight className="w-3 h-3" />
                  </Link>
                  {step.shortcuts && step.shortcuts.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {step.shortcuts.map((s) => (
                        <Link
                          key={s.href}
                          href={s.href}
                          className="font-mono text-[11px] text-primary-700 bg-white border border-primary-200 rounded px-1.5 py-0.5 hover:bg-primary-50"
                        >
                          {s.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {isNext && (
                <span className="absolute -top-2 right-2 text-[10px] font-semibold uppercase tracking-wide text-white bg-primary-500 rounded px-1.5 py-0.5">
                  Next
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
