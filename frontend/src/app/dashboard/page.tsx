"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  FlaskConical, FileText, Microscope, MessageSquareWarning,
  AlertTriangle, Wrench, Plus,
} from "lucide-react";
import { format, subDays } from "date-fns";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/ui/Card";
import { qualityApi, samplesApi, contractsApi, reportsApi } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { getCurrentUser } from "@/lib/auth";
import type { Report, Contract, Sample } from "@/lib/types";

// ─── Customer Portal Dashboard ────────────────────────────────────────────────
function CustomerDashboard() {
  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts"],
    queryFn: () => contractsApi.list().then((r) => r.data),
  });

  const { data: samples = [] } = useQuery({
    queryKey: ["samples"],
    queryFn: () => samplesApi.list().then((r) => r.data),
  });

  const { data: reports = [] } = useQuery({
    queryKey: ["reports"],
    queryFn: () => reportsApi.list().then((r) => r.data),
  });

  const router = useRouter();

  const issuedReports = (reports as Report[]).filter((r) => r.status === "issued");
  const activeContracts = (contracts as Contract[]).filter((c) => c.status === "approved");

  return (
    <DashboardLayout title="My Portal">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="My Contracts" value={contracts.length} icon={<FileText className="w-5 h-5" />} color="blue" />
        <StatCard title="Active Contracts" value={activeContracts.length} icon={<FileText className="w-5 h-5" />} color="green" />
        <StatCard title="Samples" value={samples.length} icon={<FlaskConical className="w-5 h-5" />} color="yellow" />
        <StatCard title="Reports Issued" value={issuedReports.length} icon={<Microscope className="w-5 h-5" />} color="blue" />
      </div>

      {/* Samples table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 text-sm">My Samples</h3>
          <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/samples")}>
            View All Samples
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {["Sample Code", "Type", "Status", "Received"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(samples as Sample[]).length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-sm">No samples found.</td></tr>
              ) : (
                (samples as Sample[]).slice(0, 8).map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/dashboard/samples/${s.id}`)}>
                    <td className="px-4 py-2.5 font-mono text-xs text-primary-600 font-medium">{s.sample_code}</td>
                    <td className="px-4 py-2.5 text-gray-800">{s.sample_type || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        s.status === "completed" ? "bg-green-100 text-green-700" :
                        s.status === "in_testing" ? "bg-blue-100 text-blue-700" :
                        s.status === "received" ? "bg-yellow-100 text-yellow-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>{s.status.replace("_", " ")}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{format(new Date(s.received_at), "MMM d, yyyy")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent contracts */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm">My Contracts</h3>
            <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/reports")}>
              View Reports
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {["Number", "Title", "Status", "Date"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(contracts as Contract[]).length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-sm">No contracts found.</td></tr>
                ) : (
                  (contracts as Contract[]).slice(0, 8).map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{c.contract_number}</td>
                      <td className="px-4 py-2.5 text-gray-800">{c.title}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.status === "approved" ? "bg-green-100 text-green-700" :
                          c.status === "draft" ? "bg-gray-100 text-gray-600" :
                          "bg-yellow-100 text-yellow-700"
                        }`}>{c.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{format(new Date(c.created_at), "MMM d, yyyy")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent reports */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 text-sm">Recent Reports</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {["Number", "Type", "Status", "Issued"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(reports as Report[]).length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-sm">No reports available yet.</td></tr>
                ) : (
                  (reports as Report[]).slice(0, 8).map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push("/dashboard/reports")}>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{r.report_number}</td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs capitalize">{r.report_type.replace("_", " ")}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.status === "issued" ? "bg-green-100 text-green-700" :
                          r.status === "draft" ? "bg-gray-100 text-gray-600" :
                          "bg-yellow-100 text-yellow-700"
                        }`}>{r.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">
                        {r.issued_at ? format(new Date(r.issued_at), "MMM d, yyyy") : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

// ─── Staff Dashboard ──────────────────────────────────────────────────────────
export default function DashboardPage() {
  const user = getCurrentUser();

  if (user?.role === "customer") {
    return <CustomerDashboard />;
  }

  return <StaffDashboard />;
}

function StaffDashboard() {
  const router = useRouter();

  const { data: qaDash } = useQuery({
    queryKey: ["quality-dashboard"],
    queryFn: () => qualityApi.dashboard().then((r) => r.data),
  });

  const { data: samples = [] } = useQuery({
    queryKey: ["samples"],
    queryFn: () => samplesApi.list().then((r) => r.data),
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts"],
    queryFn: () => contractsApi.list().then((r) => r.data),
  });

  const { data: auditLogs } = useQuery({
    queryKey: ["audit-logs-recent"],
    queryFn: () => qualityApi.auditLogs({ limit: 10 }).then((r) => r.data),
  });

  // Build last-30-days chart data from samples
  const chartData = Array.from({ length: 30 }, (_, i) => {
    const d = subDays(new Date(), 29 - i);
    const dateStr = format(d, "yyyy-MM-dd");
    const count = samples.filter((s) => s.created_at?.startsWith(dateStr)).length;
    return { date: format(d, "MMM dd"), count };
  });

  const activeContracts = contracts.filter((c) => c.status === "approved").length;

  return (
    <DashboardLayout title="Dashboard">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <StatCard
          title="Total Samples"
          value={samples.length}
          icon={<FlaskConical className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="Active Contracts"
          value={activeContracts}
          icon={<FileText className="w-5 h-5" />}
          color="green"
        />
        <StatCard
          title="Samples in Testing"
          value={qaDash?.samples_in_testing ?? 0}
          icon={<Microscope className="w-5 h-5" />}
          color="yellow"
        />
        <StatCard
          title="Open Complaints"
          value={qaDash?.open_complaints ?? 0}
          icon={<MessageSquareWarning className="w-5 h-5" />}
          color="red"
        />
        <StatCard
          title="Open NCs"
          value={qaDash?.open_nonconformities ?? 0}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="red"
        />
        <StatCard
          title="Calibration Due"
          value={qaDash?.equipment_calibration_due ?? 0}
          icon={<Wrench className="w-5 h-5" />}
          color="yellow"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-semibold text-gray-900 mb-4 text-sm">Samples Received — Last 30 Days</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-semibold text-gray-900 mb-4 text-sm">Quick Actions</h3>
          <div className="space-y-3">
            <Button
              className="w-full justify-start"
              onClick={() => router.push("/dashboard/samples")}
            >
              <Plus className="w-4 h-4" />
              New Sample
            </Button>
            <Button
              variant="secondary"
              className="w-full justify-start"
              onClick={() => router.push("/dashboard/contracts")}
            >
              <Plus className="w-4 h-4" />
              New Contract
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => router.push("/dashboard/complaints")}
            >
              <Plus className="w-4 h-4" />
              File Complaint
            </Button>
          </div>

          {/* NC risk breakdown */}
          {qaDash && (
            <div className="mt-6 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Open NCs by Risk
              </p>
              {[
                { label: "High", count: qaDash.open_ncs_by_risk.high, color: "bg-red-100 text-red-700" },
                { label: "Medium", count: qaDash.open_ncs_by_risk.medium, color: "bg-yellow-100 text-yellow-700" },
                { label: "Low", count: qaDash.open_ncs_by_risk.low, color: "bg-green-100 text-green-700" },
              ].map(({ label, count, color }) => (
                <div key={label} className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-gray-600">{label}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Audit Logs */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 text-sm">Recent Activity</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {["Action", "Resource", "Resource ID", "Time"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(auditLogs?.items ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-sm">
                    No recent activity.
                  </td>
                </tr>
              ) : (
                (auditLogs?.items ?? []).map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{log.action}</td>
                    <td className="px-4 py-2.5 text-gray-600 capitalize">{log.resource_type}</td>
                    <td className="px-4 py-2.5 text-gray-500">{log.resource_id ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">
                      {log.created_at ? format(new Date(log.created_at), "MMM d, HH:mm") : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
