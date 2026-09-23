"use client";

import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, AlertCircle, PackageSearch, TrendingDown, TrendingUp,
  ArrowDownCircle, ArrowUpCircle, History, Search, Download, Upload,
  FlaskConical, Trash2, FileDown,
} from "lucide-react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { inventoryApi, testCatalogApi } from "@/lib/api";
import type {
  InventoryItem, InventoryTransaction, InventoryCategory, TransactionType,
  TestReagentUsage, CsvImportResult, TestCatalogItem,
} from "@/lib/types";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const CATEGORIES: InventoryCategory[] = [
  "reagent", "standard", "consumable", "glassware", "media", "ppe", "other",
];

const UNITS = ["mL", "L", "g", "kg", "mg", "pcs", "box", "pack", "vial", "bottle"];

// ── schemas ──────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  item_code: z.string().min(1, "Required"),
  name: z.string().min(1, "Required"),
  category: z.enum([
    "reagent", "standard", "consumable", "glassware", "media", "ppe", "other",
  ]),
  unit: z.string().min(1, "Required"),
  minimum_stock: z.coerce.number().min(0),
  opening_stock: z.coerce.number().min(0).optional(),
  supplier: z.string().optional(),
  catalog_number: z.string().optional(),
  storage_location: z.string().optional(),
  storage_conditions: z.string().optional(),
  unit_cost: z.coerce.number().optional(),
  expiry_date: z.string().optional(),
  description: z.string().optional(),
});
type ItemForm = z.infer<typeof itemSchema>;

const txSchema = z.object({
  transaction_type: z.enum(["receive", "use", "adjust", "dispose", "return_stock"]),
  quantity: z.coerce.number().refine((n) => n !== 0, "Quantity required"),
  transaction_date: z.string().optional(),
  lot_number: z.string().optional(),
  expiry_date: z.string().optional(),
  supplier: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});
type TxForm = z.infer<typeof txSchema>;

// ── helpers ──────────────────────────────────────────────────────────────────

const TX_LABEL: Record<TransactionType, string> = {
  receive: "Received",
  use: "Used",
  adjust: "Adjusted",
  dispose: "Disposed",
  return_stock: "Returned",
};

const TX_COLOR: Record<TransactionType, string> = {
  receive: "bg-green-100 text-green-700",
  return_stock: "bg-emerald-100 text-emerald-700",
  use: "bg-blue-100 text-blue-700",
  adjust: "bg-amber-100 text-amber-700",
  dispose: "bg-red-100 text-red-700",
};

// ── page ─────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [txItem, setTxItem] = useState<InventoryItem | null>(null);
  const [ledgerItem, setLedgerItem] = useState<InventoryItem | null>(null);
  const [showMappings, setShowMappings] = useState(false);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["inventory", categoryFilter, search],
    queryFn: () =>
      inventoryApi
        .list({
          category: (categoryFilter || undefined) as InventoryCategory | undefined,
          search: search || undefined,
        })
        .then((r) => r.data),
  });

  const { data: stats } = useQuery({
    queryKey: ["inventory-stats"],
    queryFn: () => inventoryApi.stats().then((r) => r.data),
  });

  const { data: lowStock = [] } = useQuery({
    queryKey: ["inventory-low"],
    queryFn: () => inventoryApi.lowStock().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: ItemForm) => inventoryApi.create(data as Partial<InventoryItem> & { opening_stock?: number }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-stats"] });
      qc.invalidateQueries({ queryKey: ["inventory-low"] });
      setShowCreate(false);
      itemForm.reset();
    },
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => inventoryApi.importItems(file).then((r) => r.data),
    onSuccess: (result) => {
      setImportResult(result);
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-stats"] });
      qc.invalidateQueries({ queryKey: ["inventory-low"] });
    },
  });

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) importMutation.mutate(f);
    if (fileRef.current) fileRef.current.value = "";
  };

  const txMutation = useMutation({
    mutationFn: (data: TxForm & { item_id: number }) =>
      inventoryApi.addTransaction(data as Partial<InventoryTransaction>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-stats"] });
      qc.invalidateQueries({ queryKey: ["inventory-low"] });
      qc.invalidateQueries({ queryKey: ["inventory-tx"] });
      setTxItem(null);
      txForm.reset();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InventoryItem> }) =>
      inventoryApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-stats"] });
      qc.invalidateQueries({ queryKey: ["inventory-low"] });
      setEditItem(null);
      editForm.reset();
    },
  });

  const itemForm = useForm<ItemForm>({
    resolver: zodResolver(itemSchema),
    mode: "onChange",
    defaultValues: { category: "reagent", minimum_stock: 0, unit: "mL" },
  });

  const editForm = useForm<ItemForm>({
    resolver: zodResolver(itemSchema),
    mode: "onChange",
    defaultValues: { category: "reagent", minimum_stock: 0, unit: "mL" },
  });

  const txForm = useForm<TxForm>({
    resolver: zodResolver(txSchema),
    mode: "onChange",
    defaultValues: { transaction_type: "receive" },
  });

  const columns = useMemo(
    () => [
      {
        key: "item_code",
        header: "Code",
        render: (r: InventoryItem) => (
          <button
            onClick={() => {
              editForm.reset({
                item_code: r.item_code,
                name: r.name,
                category: r.category,
                unit: r.unit,
                minimum_stock: r.minimum_stock,
                supplier: r.supplier ?? "",
                catalog_number: r.catalog_number ?? "",
                storage_location: r.storage_location ?? "",
                storage_conditions: r.storage_conditions ?? "",
                unit_cost: r.unit_cost ?? undefined,
                expiry_date: r.expiry_date ?? "",
                description: r.description ?? "",
              });
              setEditItem(r);
            }}
            className="font-mono font-medium text-primary-600 hover:underline cursor-pointer"
            title="Click to edit item"
          >
            {r.item_code}
          </button>
        ),
      },
      { key: "name", header: "Name" },
      {
        key: "category",
        header: "Category",
        render: (r: InventoryItem) => (
          <Badge variant="default" className="capitalize">
            {r.category}
          </Badge>
        ),
      },
      {
        key: "current_stock",
        header: "Stock",
        render: (r: InventoryItem) => {
          const low = r.is_low_stock;
          return (
            <span
              className={`font-mono font-semibold ${low ? "text-red-600" : "text-gray-800"}`}
            >
              {r.current_stock} {r.unit}
              {low && <span className="ml-1 text-[10px] text-red-500">(low)</span>}
            </span>
          );
        },
      },
      {
        key: "minimum_stock",
        header: "Min",
        render: (r: InventoryItem) => (
          <span className="text-xs text-gray-500 font-mono">
            {r.minimum_stock} {r.unit}
          </span>
        ),
      },
      {
        key: "unit_cost",
        header: "Unit Cost",
        render: (r: InventoryItem) => (
          <span className="text-xs text-gray-700 font-mono">
            {r.unit_cost != null ? `KES ${Number(r.unit_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}
          </span>
        ),
      },
      {
        key: "stock_value",
        header: "Stock Value",
        render: (r: InventoryItem) => {
          if (r.unit_cost == null) return <span className="text-xs text-gray-400">—</span>;
          const val = r.current_stock * r.unit_cost;
          return <span className="text-xs text-gray-700 font-mono">KES {val.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>;
        },
      },
      {
        key: "expiry_date",
        header: "Expiry",
        render: (r: InventoryItem) => {
          if (!r.expiry_date) return <span className="text-xs text-gray-400">—</span>;
          const d = new Date(r.expiry_date);
          const isExpired = d < new Date();
          return (
            <span className={`text-xs font-mono ${isExpired ? "text-red-600 font-semibold" : "text-gray-700"}`}>
              {format(d, "dd MMM yyyy")}
              {isExpired && " (expired)"}
            </span>
          );
        },
      },
      {
        key: "storage_location",
        header: "Location",
        render: (r: InventoryItem) => (
          <span className="text-xs text-gray-600">{r.storage_location ?? "—"}</span>
        ),
      },
      {
        key: "expiry_date",
        header: "Expiry",
        render: (r: InventoryItem) => {
          if (!r.expiry_date) return <span className="text-xs text-gray-400">—</span>;
          const expiry = new Date(r.expiry_date);
          const now = new Date();
          const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          const color = daysLeft < 0 ? "text-red-600 font-semibold" : daysLeft <= 30 ? "text-amber-600" : "text-gray-600";
          const label = daysLeft < 0 ? "Expired" : `${daysLeft}d`;
          return (
            <span className={`text-xs ${color}`}>
              {format(expiry, "MMM d, yyyy")}
              <span className="ml-1 text-[10px]">({label})</span>
            </span>
          );
        },
      },
      {
        key: "supplier",
        header: "Supplier",
        render: (r: InventoryItem) => (
          <span className="text-xs text-gray-600">{r.supplier ?? "—"}</span>
        ),
      },
      {
        key: "actions",
        header: "",
        render: (r: InventoryItem) => (
          <div className="flex gap-1 justify-end">
            <button
              onClick={() => {
                txForm.reset({ transaction_type: "receive" });
                setTxItem(r);
              }}
              className="p-1.5 rounded hover:bg-green-50 text-green-600"
              title="Receive"
            >
              <ArrowDownCircle className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                txForm.reset({ transaction_type: "use" });
                setTxItem(r);
              }}
              className="p-1.5 rounded hover:bg-blue-50 text-blue-600"
              title="Use / Issue"
            >
              <ArrowUpCircle className="w-4 h-4" />
            </button>
            <button
              onClick={() => setLedgerItem(r)}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
              title="Ledger"
            >
              <History className="w-4 h-4" />
            </button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <DashboardLayout title="Inventory">
      <div className="space-y-4">
        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            icon={<PackageSearch className="w-5 h-5 text-primary-600" />}
            label="Total Items"
            value={stats?.total_items ?? "—"}
          />
          <StatCard
            icon={<TrendingDown className="w-5 h-5 text-red-600" />}
            label="Low Stock"
            value={stats?.low_stock_count ?? "—"}
            accent={stats && stats.low_stock_count > 0 ? "red" : undefined}
          />
          <StatCard
            icon={<AlertCircle className="w-5 h-5 text-amber-600" />}
            label="Expiring (30d)"
            value={stats?.expiring_soon_count ?? "—"}
            accent={stats && stats.expiring_soon_count > 0 ? "amber" : undefined}
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
            label="Total Value"
            value={
              stats ? `KES ${stats.total_value.toLocaleString()}` : "—"
            }
          />
        </div>

        {/* Low-stock alert */}
        {lowStock.length > 0 && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800 text-sm">Low Stock Alert</p>
              <p className="text-red-700 text-xs mt-0.5">
                {lowStock.length} item{lowStock.length !== 1 ? "s" : ""} at or below minimum:{" "}
                {lowStock.slice(0, 6).map((i) => i.item_code).join(", ")}
                {lowStock.length > 6 ? ` (+${lowStock.length - 6} more)` : ""}
              </p>
            </div>
          </div>
        )}

        {/* Filters + action */}
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="flex gap-2 flex-1 max-w-xl">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search name, code, catalog #"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 flex-wrap">
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleFilePick}
              className="hidden"
            />
            <Button
              variant="secondary"
              onClick={() =>
                inventoryApi.downloadCsv(
                  "/inventory/export/template.csv",
                  "inventory_import_template.csv"
                )
              }
              title="Download blank CSV template"
            >
              <FileDown className="w-4 h-4" />
              Template
            </Button>
            <Button
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              loading={importMutation.isPending}
            >
              <Upload className="w-4 h-4" />
              Import
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                inventoryApi.downloadCsv(
                  "/inventory/export/items.csv",
                  `inventory_items_${new Date().toISOString().slice(0, 10)}.csv`
                )
              }
            >
              <Download className="w-4 h-4" />
              Export Items
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                inventoryApi.downloadCsv(
                  "/inventory/export/transactions.csv",
                  `inventory_ledger_${new Date().toISOString().slice(0, 10)}.csv`
                )
              }
            >
              <Download className="w-4 h-4" />
              Export Ledger
            </Button>
            <Button variant="secondary" onClick={() => setShowMappings(true)}>
              <FlaskConical className="w-4 h-4" />
              Test Reagents
            </Button>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" />
              Add Item
            </Button>
          </div>
        </div>

        <Table<InventoryItem>
          columns={columns}
          data={items}
          loading={isLoading}
          emptyMessage="No inventory items yet. Click 'Add Item' to begin."
          keyExtractor={(r) => r.id}
        />
      </div>

      {/* ── Add item modal ─────────────────────────────────────────────────── */}
      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          itemForm.reset();
        }}
        title="Add Inventory Item"
        size="lg"
      >
        <form
          onSubmit={itemForm.handleSubmit((data) => createMutation.mutateAsync(data))}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Item Code *"
              error={itemForm.formState.errors.item_code?.message}
              {...itemForm.register("item_code")}
              placeholder="e.g. RG-001"
            />
            <Input
              label="Name *"
              error={itemForm.formState.errors.name?.message}
              {...itemForm.register("name")}
              placeholder="e.g. Nitric Acid 65%"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Select label="Category *" {...itemForm.register("category")}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c}
                </option>
              ))}
            </Select>
            <Select label="Unit *" {...itemForm.register("unit")}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
            <Input
              label="Min. Stock *"
              type="number"
              step="any"
              {...itemForm.register("minimum_stock")}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Opening Stock"
              type="number"
              step="any"
              {...itemForm.register("opening_stock")}
              placeholder="Initial quantity on hand"
            />
            <Input
              label="Unit Cost / Buying Price (KES)"
              type="number"
              step="any"
              {...itemForm.register("unit_cost")}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Supplier" {...itemForm.register("supplier")} />
            <Input
              label="Catalog #"
              {...itemForm.register("catalog_number")}
              placeholder="Manufacturer ref"
            />
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Expiry Date</label>
              <input type="date" {...itemForm.register("expiry_date")} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Storage Location"
              {...itemForm.register("storage_location")}
              placeholder="e.g. Shelf A2"
            />
            <Input
              label="Storage Conditions"
              {...itemForm.register("storage_conditions")}
              placeholder="e.g. 2-8°C"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Expiry Date"
              type="date"
              {...itemForm.register("expiry_date")}
            />
            <div />
          </div>
          <Textarea
            label="Description / Notes"
            rows={2}
            {...itemForm.register("description")}
          />
          <div className="flex gap-3 justify-end pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowCreate(false);
                itemForm.reset();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending} disabled={!itemForm.formState.isValid}>
              Create Item
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Edit item modal ───────────────────────────────────────────────── */}
      <Modal
        open={!!editItem}
        onClose={() => { setEditItem(null); editForm.reset(); }}
        title={editItem ? `Edit Item — ${editItem.item_code}` : ""}
        size="lg"
      >
        {editItem && (
          <form
            onSubmit={editForm.handleSubmit((data) =>
              updateMutation.mutateAsync({ id: editItem.id, data: data as Partial<InventoryItem> })
            )}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <Input label="Item Code *" error={editForm.formState.errors.item_code?.message} {...editForm.register("item_code")} />
              <Input label="Name *" error={editForm.formState.errors.name?.message} {...editForm.register("name")} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Select label="Category *" {...editForm.register("category")}>
                {CATEGORIES.map((c) => (<option key={c} value={c} className="capitalize">{c}</option>))}
              </Select>
              <Select label="Unit *" {...editForm.register("unit")}>
                {UNITS.map((u) => (<option key={u} value={u}>{u}</option>))}
              </Select>
              <Input label="Min. Stock *" type="number" step="any" {...editForm.register("minimum_stock")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Unit Cost / Buying Price (KES)" type="number" step="any" {...editForm.register("unit_cost")} placeholder="e.g. 1500.00" />
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Expiry Date</label>
                <input type="date" {...editForm.register("expiry_date")} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Supplier" {...editForm.register("supplier")} />
              <Input label="Catalog #" {...editForm.register("catalog_number")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Storage Location" {...editForm.register("storage_location")} placeholder="e.g. Shelf A2" />
              <Input label="Storage Conditions" {...editForm.register("storage_conditions")} placeholder="e.g. 2-8°C" />
            </div>
            <Textarea label="Description / Notes" rows={2} {...editForm.register("description")} />
            <div className="flex gap-3 justify-end pt-2">
              <Button type="button" variant="secondary" onClick={() => { setEditItem(null); editForm.reset(); }}>Cancel</Button>
              <Button type="submit" loading={updateMutation.isPending} disabled={!editForm.formState.isValid}>Save Changes</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Transaction modal ──────────────────────────────────────────────── */}
      <Modal
        open={!!txItem}
        onClose={() => {
          setTxItem(null);
          txForm.reset();
        }}
        title={txItem ? `Stock Movement — ${txItem.name}` : ""}
        size="md"
      >
        {txItem && (
          <form
            onSubmit={txForm.handleSubmit((data) =>
              txMutation.mutateAsync({ ...data, item_id: txItem.id })
            )}
            className="space-y-4"
          >
            <Card className="p-3 bg-gray-50 border">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <p className="text-xs text-gray-500">Current stock</p>
                  <p className="font-mono font-semibold text-gray-800">
                    {txItem.current_stock} {txItem.unit}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Minimum</p>
                  <p className="font-mono text-gray-700">
                    {txItem.minimum_stock} {txItem.unit}
                  </p>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Transaction Type *"
                {...txForm.register("transaction_type")}
              >
                <option value="receive">Receive (stock in)</option>
                <option value="use">Use / Issue (stock out)</option>
                <option value="adjust">Adjust (±)</option>
                <option value="dispose">Dispose</option>
                <option value="return_stock">Return</option>
              </Select>
              <Input
                label={`Quantity (${txItem.unit}) *`}
                type="number"
                step="any"
                error={txForm.formState.errors.quantity?.message}
                {...txForm.register("quantity")}
                placeholder="e.g. 500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Date"
                type="date"
                {...txForm.register("transaction_date")}
              />
              <Input
                label="Lot / Batch #"
                {...txForm.register("lot_number")}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Expiry Date"
                type="date"
                {...txForm.register("expiry_date")}
              />
              <Input
                label="Supplier"
                {...txForm.register("supplier")}
              />
            </div>

            <Input
              label="Reference"
              {...txForm.register("reference")}
              placeholder="PO #, Sample code, Test ID…"
            />
            <Textarea label="Notes" rows={2} {...txForm.register("notes")} />

            <div className="flex gap-3 justify-end pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setTxItem(null);
                  txForm.reset();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" loading={txMutation.isPending} disabled={!txForm.formState.isValid}>
                Record Movement
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Ledger modal ───────────────────────────────────────────────────── */}
      <Modal
        open={!!ledgerItem}
        onClose={() => setLedgerItem(null)}
        title={ledgerItem ? `Ledger — ${ledgerItem.name}` : ""}
        size="lg"
      >
        {ledgerItem && <LedgerView item={ledgerItem} />}
      </Modal>

      {/* ── Test reagent mapping modal ─────────────────────────────────────── */}
      <Modal
        open={showMappings}
        onClose={() => setShowMappings(false)}
        title="Test → Reagent Usage Mapping"
        size="lg"
      >
        <ReagentMappingManager items={items} />
      </Modal>

      {/* ── Import result modal ────────────────────────────────────────────── */}
      <Modal
        open={!!importResult}
        onClose={() => setImportResult(null)}
        title="CSV Import Result"
        size="md"
      >
        {importResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{importResult.created}</p>
                <p className="text-xs text-green-700">Created</p>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
                <p className="text-2xl font-bold text-blue-700">{importResult.updated}</p>
                <p className="text-xs text-blue-700">Updated</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
                <p className="text-2xl font-bold text-amber-700">{importResult.skipped}</p>
                <p className="text-xs text-amber-700">Skipped</p>
              </div>
            </div>
            {importResult.errors.length > 0 && (
              <div>
                <p className="text-sm font-medium text-red-700 mb-1">Errors</p>
                <ul className="max-h-40 overflow-y-auto text-xs text-red-600 border border-red-200 bg-red-50 rounded-lg p-3 space-y-1">
                  {importResult.errors.map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={() => setImportResult(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}

// ── sub-components ───────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent?: "red" | "amber";
}) {
  const border =
    accent === "red"
      ? "border-red-200 bg-red-50"
      : accent === "amber"
      ? "border-amber-200 bg-amber-50"
      : "border-gray-200 bg-white";
  return (
    <div className={`rounded-xl border p-4 ${border}`}>
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-1">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-semibold text-gray-800">{value}</p>
    </div>
  );
}

function ReagentMappingManager({ items }: { items: InventoryItem[] }) {
  const qc = useQueryClient();
  const [catalogId, setCatalogId] = useState<number | "">("");
  const [inventoryId, setInventoryId] = useState<number | "">("");
  const [quantity, setQuantity] = useState<string>("");

  const { data: catalog = [] } = useQuery({
    queryKey: ["catalog-tests-active"],
    queryFn: () => testCatalogApi.list({ active_only: true }).then((r) => r.data),
  });

  const { data: mappings = [], isLoading } = useQuery({
    queryKey: ["inventory-usage"],
    queryFn: () => inventoryApi.listUsage().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      catalog_item_id: number;
      inventory_item_id: number;
      quantity_per_test: number;
      notes?: string;
    }) => inventoryApi.createUsage(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-usage"] });
      setCatalogId("");
      setInventoryId("");
      setQuantity("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => inventoryApi.deleteUsage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory-usage"] }),
  });

  const activeItems = items.filter((i) => i.is_active);
  const selectedInventory = activeItems.find((i) => i.id === inventoryId);

  const canSubmit =
    catalogId !== "" && inventoryId !== "" && quantity !== "" && parseFloat(quantity) > 0;

  return (
    <div className="space-y-4">
      <Card className="p-3 bg-gray-50 border">
        <p className="text-xs text-gray-600 mb-3">
          Define how much of each reagent/consumable is used per test run. When a
          technician enters a result for a mapped test, stock is automatically
          deducted from the ledger.
        </p>
        <div className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-4">
            <label className="block text-xs font-medium text-gray-700 mb-1">Test</label>
            <select
              value={catalogId}
              onChange={(e) => setCatalogId(e.target.value ? Number(e.target.value) : "")}
              className="w-full px-2 py-2 text-sm border border-gray-300 rounded-lg"
            >
              <option value="">Select test…</option>
              {catalog.map((c: TestCatalogItem) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-4">
            <label className="block text-xs font-medium text-gray-700 mb-1">Reagent</label>
            <select
              value={inventoryId}
              onChange={(e) => setInventoryId(e.target.value ? Number(e.target.value) : "")}
              className="w-full px-2 py-2 text-sm border border-gray-300 rounded-lg"
            >
              <option value="">Select reagent…</option>
              {activeItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.item_code} — {i.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Qty{selectedInventory ? ` (${selectedInventory.unit})` : ""}
            </label>
            <input
              type="number"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-2 py-2 text-sm border border-gray-300 rounded-lg"
              placeholder="0.5"
            />
          </div>
          <div className="col-span-2">
            <Button
              className="w-full"
              disabled={!canSubmit}
              loading={createMutation.isPending}
              onClick={() =>
                createMutation.mutate({
                  catalog_item_id: Number(catalogId),
                  inventory_item_id: Number(inventoryId),
                  quantity_per_test: parseFloat(quantity),
                })
              }
            >
              <Plus className="w-4 h-4" />
              Add
            </Button>
          </div>
        </div>
      </Card>

      <div className="max-h-[360px] overflow-y-auto border rounded-lg">
        {isLoading ? (
          <p className="p-6 text-center text-sm text-gray-500">Loading…</p>
        ) : mappings.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500">
            No mappings yet. Add one above to enable auto-deduction.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr className="text-left text-gray-600">
                <th className="px-3 py-2 font-medium">Test</th>
                <th className="px-3 py-2 font-medium">Reagent</th>
                <th className="px-3 py-2 font-medium text-right">Qty / Test</th>
                <th className="px-3 py-2 font-medium text-right">In Stock</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {mappings.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-800">{m.catalog_item_name ?? `#${m.catalog_item_id}`}</td>
                  <td className="px-3 py-2 text-gray-700">
                    <span className="font-mono text-[10px] text-primary-600">
                      {m.inventory_item_code}
                    </span>{" "}
                    {m.inventory_item_name}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {m.quantity_per_test} {m.inventory_unit}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-gray-600">
                    {m.current_stock ?? "—"} {m.inventory_unit}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => {
                        if (confirm("Delete this mapping?")) deleteMutation.mutate(m.id);
                      }}
                      className="p-1 rounded hover:bg-red-50 text-red-600"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function LedgerView({ item }: { item: InventoryItem }) {
  const { data: txs = [], isLoading } = useQuery({
    queryKey: ["inventory-tx", item.id],
    queryFn: () => inventoryApi.transactions(item.id).then((r) => r.data),
  });

  return (
    <div className="space-y-3">
      <Card className="p-3 bg-gray-50 border">
        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="text-xs text-gray-500">Code</p>
            <p className="font-mono font-medium">{item.item_code}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Current</p>
            <p
              className={`font-mono font-semibold ${
                item.is_low_stock ? "text-red-600" : "text-gray-800"
              }`}
            >
              {item.current_stock} {item.unit}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Minimum</p>
            <p className="font-mono text-gray-700">
              {item.minimum_stock} {item.unit}
            </p>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <p className="text-sm text-gray-500 p-6 text-center">Loading ledger…</p>
      ) : txs.length === 0 ? (
        <p className="text-sm text-gray-500 p-6 text-center">
          No transactions recorded yet.
        </p>
      ) : (
        <div className="max-h-[400px] overflow-y-auto border rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr className="text-left text-gray-600">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium text-right">Qty</th>
                <th className="px-3 py-2 font-medium text-right">Balance</th>
                <th className="px-3 py-2 font-medium">Lot</th>
                <th className="px-3 py-2 font-medium">Expiry</th>
                <th className="px-3 py-2 font-medium">Ref</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {txs.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                    {format(new Date(t.transaction_date), "MMM d, yyyy")}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        TX_COLOR[t.transaction_type]
                      }`}
                    >
                      {TX_LABEL[t.transaction_type]}
                    </span>
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      t.quantity > 0 ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {t.quantity > 0 ? "+" : ""}
                    {t.quantity} {item.unit}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">
                    {t.balance_after} {item.unit}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{t.lot_number ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600">{t.expiry_date ? format(new Date(t.expiry_date), "dd MMM yyyy") : "—"}</td>
                  <td className="px-3 py-2 text-gray-600">{t.reference ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
