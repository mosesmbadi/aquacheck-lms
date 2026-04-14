"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FileText,
  FlaskConical,
  Wrench,
  ClipboardList,
  MessageSquareWarning,
  AlertTriangle,
  ShieldCheck,
  Settings,
  LogOut,
  BookMarked,
  Library,
  Package,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentUser, logout } from "@/lib/auth";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Customers", href: "/dashboard/customers", icon: Users },
  { label: "Contracts", href: "/dashboard/contracts", icon: FileText },
  { label: "Samples", href: "/dashboard/samples", icon: FlaskConical },
  { label: "Equipment", href: "/dashboard/equipment", icon: Wrench },
  { label: "Inventory", href: "/dashboard/inventory", icon: Package },
  { label: "Reports", href: "/dashboard/reports", icon: ClipboardList },
  { label: "Quotations", href: "/dashboard/quotations", icon: Receipt },
  { label: "Complaints", href: "/dashboard/complaints", icon: MessageSquareWarning },
  { label: "Non-Conformities", href: "/dashboard/nonconformities", icon: AlertTriangle },
  { label: "Quality", href: "/dashboard/quality", icon: ShieldCheck },
];

const customerNavItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Samples", href: "/dashboard/samples", icon: FlaskConical },
  { label: "Reports", href: "/dashboard/reports", icon: ClipboardList },
  { label: "Complaints", href: "/dashboard/complaints", icon: MessageSquareWarning },
];

const adminItems = [{ label: "Admin", href: "/dashboard/admin", icon: Settings }];

const catalogItems = [
  { label: "Test Catalog", href: "/dashboard/catalog/tests", icon: Library },
];

const settingsItems = [{ label: "Docs", href: "/dashboard/settings/docs", icon: BookMarked }];

export function Sidebar() {
  const pathname = usePathname();
  const user = getCurrentUser();

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <aside className="flex flex-col w-64 bg-dark text-white min-h-screen fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-dark-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary-400 rounded-lg flex items-center justify-center flex-shrink-0">
            <FlaskConical className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-sm leading-tight">AquaCheck</p>
            <p className="text-primary-400 text-xs">LIMS</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
        {(user?.role === "customer" ? customerNavItems : navItems).map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              isActive(href)
                ? "bg-primary-400 text-white"
                : "text-gray-300 hover:bg-dark-700 hover:text-white"
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </Link>
        ))}

        {user?.role === "admin" && (
          <div className="pt-3 mt-3 border-t border-dark-700">
            {adminItems.map(({ label, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive(href)
                    ? "bg-primary-400 text-white"
                    : "text-gray-300 hover:bg-dark-700 hover:text-white"
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            ))}
          </div>
        )}

        {/* Catalog */}
        {user?.role !== "customer" && (
        <div className="pt-3 mt-3 border-t border-dark-700">
          <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Catalog
          </p>
          {catalogItems.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive(href)
                  ? "bg-primary-400 text-white"
                  : "text-gray-300 hover:bg-dark-700 hover:text-white"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          ))}
        </div>
        )}

        {/* Settings */}
        {user?.role !== "customer" && (
        <div className="pt-3 mt-3 border-t border-dark-700">
          <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Settings
          </p>
          {settingsItems.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive(href)
                  ? "bg-primary-400 text-white"
                  : "text-gray-300 hover:bg-dark-700 hover:text-white"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          ))}
        </div>
        )}
      </nav>

      {/* User section */}
      <div className="px-3 py-4 border-t border-dark-700">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-primary-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {user?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">{user?.full_name ?? "User"}</p>
            <p className="text-xs text-gray-400 truncate capitalize">{user?.role?.replace("_", " ")}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-dark-700 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
