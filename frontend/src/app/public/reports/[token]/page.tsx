"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import axios from "axios";
import { getToken } from "@/lib/auth";

const baseApiUrl =
  process.env.NEXT_PUBLIC_API_URL ??
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8088`
    : "http://localhost:8088");

interface PublicReport {
  report_number: string;
  report_type: string;
  status: string;
  issued_at?: string;
  client_name: string;
  sample_description: string;
  sampling_location: string;
  sampling_date: string;
  sampled_by: string;
  parameters: Array<{
    parameter: string;
    method: string;
    section: string;
    result?: string;
    specification?: string;
    remarks?: string;
  }>;
  authorized: boolean;
  laboratory: string;
  note: string;
}

export default function PublicReportPage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, isError } = useQuery<PublicReport>({
    queryKey: ["public-report", token],
    queryFn: () => {
      const authToken = getToken();
      return axios
        .get(`${baseApiUrl}/api/v1/public/reports/${token}`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
        })
        .then((r) => r.data);
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 text-sm">Loading report…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Report Not Found</h2>
          <p className="text-sm text-gray-500">
            This report may not have been issued yet, or the QR code link is invalid.
          </p>
        </div>
      </div>
    );
  }

  const sectionNames = Array.from(new Set(data.parameters.map((p) => p.section))).filter(Boolean);
  const bySection: Record<string, typeof data.parameters> = {};
  for (const p of data.parameters) {
    const key = p.section || "Parameters";
    if (!bySection[key]) bySection[key] = [];
    bySection[key].push(p);
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">AquaCheck Laboratories Limited</p>
              <h1 className="text-2xl font-bold text-gray-900 mt-1">{data.report_number}</h1>
              <p className="text-sm text-gray-500 capitalize">{data.report_type.replace(/_/g, " ")}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              data.status === "issued" || data.status === "amended"
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-500"
            }`}>
              {data.status.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoRow label="Client" value={data.client_name} />
            <InfoRow label="Issued" value={data.issued_at ? format(new Date(data.issued_at), "dd MMM yyyy") : "—"} />
            <InfoRow label="Sample" value={data.sample_description} />
            <InfoRow label="Location" value={data.sampling_location} />
            <InfoRow label="Sampling Date" value={data.sampling_date} />
            <InfoRow label="Sampled By" value={data.sampled_by} />
          </div>
        </div>

        {/* Parameters tested */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Parameters Tested</h2>
          {data.parameters.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No parameters listed.</p>
          ) : (
            (sectionNames.length > 0 ? sectionNames : ["Parameters"]).map((section) => (
              <div key={section} className="mb-4">
                {sectionNames.length > 0 && (
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{section}</h3>
                )}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500 text-xs">
                      <th className="pb-2">Parameter</th>
                      <th className="pb-2">Method</th>
                      {data.authorized && (
                        <>
                          <th className="pb-2">Result</th>
                          <th className="pb-2">Specification</th>
                          <th className="pb-2">Remarks</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(bySection[section] || []).map((p, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1.5 text-gray-800">{p.parameter}</td>
                        <td className="py-1.5 text-gray-500 text-xs">{p.method}</td>
                        {data.authorized && (
                          <>
                            <td className="py-1.5 text-gray-800 font-medium">{p.result}</td>
                            <td className="py-1.5 text-gray-500 text-xs">{p.specification}</td>
                            <td className="py-1.5 text-gray-500 text-xs">{p.remarks}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>

        {/* Confidentiality / access note */}
        {data.authorized ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-sm text-green-800">
              <span className="font-semibold">Verified access. </span>{data.note}
            </p>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm text-amber-800">
              <span className="font-semibold">Note: </span>{data.note}
            </p>
            <a
              href="/login"
              className="mt-2 inline-block text-xs font-medium text-amber-700 underline hover:text-amber-900"
            >
              Log in to view full results →
            </a>
          </div>
        )}

        <p className="text-center text-xs text-gray-400">
          {data.laboratory} · ISO/IEC 17025 Accredited Laboratory
        </p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value || "—"}</p>
    </div>
  );
}
