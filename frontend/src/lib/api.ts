import axios, { AxiosInstance } from "axios";
import { getToken, logout } from "./auth";
import type {
  User, UserRole, Customer, Contract, Sample, TestResult,
  Equipment, Report, Complaint, Nonconformity, AuditLog,
  PaginatedResponse, LoginResponse, QualityDashboard, TestCatalogItem, TestCategory,
  Method, Document, DocumentCategory, Quotation, QuotationItem,
  InventoryItem, InventoryTransaction, InventoryStats, InventoryCategory,
  TestReagentUsage, CsvImportResult,
} from "./types";

const baseApiUrl = process.env.NEXT_PUBLIC_API_URL ??
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8088`
    : "http://localhost:8088");
const BASE_URL = `${baseApiUrl}/api/v1`;

const api: AxiosInstance = axios.create({ baseURL: BASE_URL });

// ── Request interceptor: attach bearer token ──────────────────────────────────
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: handle 401 ─────────────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      logout();
    }
    return Promise.reject(error);
  }
);

export default api;

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>("/auth/login", { email, password }),
  me: () => api.get<User>("/auth/me"),
  register: (data: { email: string; password: string; full_name: string; role: UserRole; customer_id?: number; is_contact_person?: boolean }) =>
    api.post<User>("/auth/register", data),
};

// ─── Users ────────────────────────────────────────────────────────────────────
export const usersApi = {
  list: () => api.get<User[]>("/users"),
  get: (id: number) => api.get<User>(`/users/${id}`),
  update: (id: number, data: Partial<User & { password: string }>) =>
    api.put<User>(`/users/${id}`, data),
  delete: (id: number) => api.delete(`/users/${id}`),
};

// ─── Customers ────────────────────────────────────────────────────────────────
export const customersApi = {
  list: () => api.get<Customer[]>("/customers"),
  get: (id: number) => api.get<Customer>(`/customers/${id}`),
  create: (data: Partial<Customer>) => api.post<Customer>("/customers", data),
  update: (id: number, data: Partial<Customer>) => api.put<Customer>(`/customers/${id}`, data),
};

// ─── Contracts ────────────────────────────────────────────────────────────────
export const contractsApi = {
  list: () => api.get<Contract[]>("/contracts"),
  get: (id: number) => api.get<Contract>(`/contracts/${id}`),
  create: (data: Partial<Contract>) => api.post<Contract>("/contracts", data),
  update: (id: number, data: Partial<Contract>) => api.put<Contract>(`/contracts/${id}`, data),
  review: (id: number) => api.post<Contract>(`/contracts/${id}/review`),
  approve: (id: number) => api.post<Contract>(`/contracts/${id}/approve`),
};

// ─── Samples ──────────────────────────────────────────────────────────────────
export const samplesApi = {
  list: () => api.get<Sample[]>("/samples"),
  get: (id: number) => api.get<Sample>(`/samples/${id}`),
  create: (data: Partial<Sample>) => api.post<Sample>("/samples", data),
  update: (id: number, data: Partial<Sample>) => api.put<Sample>(`/samples/${id}`, data),
  barcode: (id: number) => api.get<{ sample_code: string; barcode_base64: string }>(`/samples/${id}/barcode`),
  addCustody: (id: number, action: string) =>
    api.post<Sample>(`/samples/${id}/custody`, { action }),
};

// ─── Test Results ─────────────────────────────────────────────────────────────
export const testResultsApi = {
  list: (params?: { sample_id?: number }) => api.get<TestResult[]>("/test-results", { params }),
  get: (id: number) => api.get<TestResult>(`/test-results/${id}`),
  create: (data: Partial<TestResult>) => api.post<TestResult>("/test-results", data),
  update: (id: number, data: Partial<TestResult>) => api.put<TestResult>(`/test-results/${id}`, data),
  validate: (id: number) => api.post<TestResult>(`/test-results/${id}/validate`),
  bulkSave: (data: { sample_id: number; rows: { catalog_item_id: number; result_value?: string; notes?: string }[] }) =>
    api.post<TestResult[]>("/test-results/bulk", data),
  calculateUncertainty: (id: number, values: number[], coverage_factor = 2.0) =>
    api.post(`/test-results/${id}/calculate-uncertainty`, { values, coverage_factor }),
};

// ─── Methods ──────────────────────────────────────────────────────────────────
export const methodsApi = {
  list: () => api.get<Method[]>("/methods"),
  get: (id: number) => api.get<Method>(`/methods/${id}`),
  create: (data: Partial<Method>) => api.post<Method>("/methods", data),
  validate: (id: number) => api.post<Method>(`/methods/${id}/validate`),
};

// ─── Equipment ────────────────────────────────────────────────────────────────
export const equipmentApi = {
  list: () => api.get<Equipment[]>("/equipment"),
  get: (id: number) => api.get<Equipment>(`/equipment/${id}`),
  create: (data: Partial<Equipment>) => api.post<Equipment>("/equipment", data),
  update: (id: number, data: Partial<Equipment>) => api.put<Equipment>(`/equipment/${id}`, data),
  calibrationDue: () => api.get<Equipment[]>("/equipment/calibration-due"),
};

// ─── Reports ──────────────────────────────────────────────────────────────────
export const reportsApi = {
  list: () => api.get<Report[]>("/reports"),
  get: (id: number) => api.get<Report>(`/reports/${id}`),
  create: (data: Partial<Report>) => api.post<Report>("/reports", data),
  issue: (id: number) => api.post<Report>(`/reports/${id}/issue`),
  pdfUrl: (id: number) => `${BASE_URL}/reports/${id}/pdf`,
};

// ─── Complaints ───────────────────────────────────────────────────────────────
export const complaintsApi = {
  list: () => api.get<Complaint[]>("/complaints"),
  get: (id: number) => api.get<Complaint>(`/complaints/${id}`),
  create: (data: Partial<Complaint>) => api.post<Complaint>("/complaints", data),
  update: (id: number, data: Partial<Complaint>) => api.put<Complaint>(`/complaints/${id}`, data),
  investigate: (id: number) => api.post<Complaint>(`/complaints/${id}/investigate`),
  close: (id: number) => api.post<Complaint>(`/complaints/${id}/close`),
};

// ─── Nonconformities ──────────────────────────────────────────────────────────
export const ncApi = {
  list: () => api.get<Nonconformity[]>("/nonconformities"),
  get: (id: number) => api.get<Nonconformity>(`/nonconformities/${id}`),
  create: (data: Partial<Nonconformity>) => api.post<Nonconformity>("/nonconformities", data),
  update: (id: number, data: Partial<Nonconformity>) =>
    api.put<Nonconformity>(`/nonconformities/${id}`, data),
  suspend: (id: number) => api.post<Nonconformity>(`/nonconformities/${id}/suspend`),
  close: (id: number) => api.post<Nonconformity>(`/nonconformities/${id}/close`),
};

// ─── Quality ──────────────────────────────────────────────────────────────────
export const qualityApi = {
  dashboard: () => api.get<QualityDashboard>("/quality/dashboard"),
  auditLogs: (params?: { skip?: number; limit?: number; resource_type?: string }) =>
    api.get<PaginatedResponse<AuditLog>>("/quality/audit-logs", { params }),
};

// ─── Documents (SOPs & Master Lists) ─────────────────────────────────────────
export const documentsApi = {
  list: (category?: DocumentCategory) =>
    api.get<Document[]>("/documents", { params: category ? { category } : undefined }),
  get: (id: number) => api.get<Document>(`/documents/${id}`),
  update: (id: number, data: Partial<Document>) => api.put<Document>(`/documents/${id}`, data),
  /** Fetch the generated PDF as a blob URL for iframe preview. */
  previewBlobUrl: (id: number): Promise<string> =>
    api.get(`/documents/${id}/pdf`, { responseType: "blob" }).then((res) =>
      window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }))
    ),
  /** Trigger a file-download of the generated PDF. */
  downloadPdf: (id: number, code: string, version: string) =>
    api
      .get(`/documents/${id}/pdf`, { params: { download: true }, responseType: "blob" })
      .then((res) => {
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${code}_v${version}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      }),
};

// ─── Inventory ────────────────────────────────────────────────────────────────
export const inventoryApi = {
  list: (params?: { category?: InventoryCategory; search?: string; active_only?: boolean }) =>
    api.get<InventoryItem[]>("/inventory", { params }),
  get: (id: number) => api.get<InventoryItem>(`/inventory/${id}`),
  create: (data: Partial<InventoryItem> & { opening_stock?: number }) =>
    api.post<InventoryItem>("/inventory", data),
  update: (id: number, data: Partial<InventoryItem>) =>
    api.put<InventoryItem>(`/inventory/${id}`, data),
  delete: (id: number) => api.delete(`/inventory/${id}`),
  stats: () => api.get<InventoryStats>("/inventory/stats"),
  lowStock: () => api.get<InventoryItem[]>("/inventory/low-stock"),
  transactions: (itemId: number) =>
    api.get<InventoryTransaction[]>(`/inventory/${itemId}/transactions`),
  recentTransactions: (limit = 50) =>
    api.get<InventoryTransaction[]>("/inventory/transactions/recent", { params: { limit } }),
  addTransaction: (data: Partial<InventoryTransaction>) =>
    api.post<InventoryTransaction>("/inventory/transactions", data),

  // Test-reagent usage mapping
  listUsage: (params?: { catalog_item_id?: number; inventory_item_id?: number }) =>
    api.get<TestReagentUsage[]>("/inventory/test-usage", { params }),
  createUsage: (data: {
    catalog_item_id: number;
    inventory_item_id: number;
    quantity_per_test: number;
    notes?: string;
  }) => api.post<TestReagentUsage>("/inventory/test-usage", data),
  deleteUsage: (id: number) => api.delete(`/inventory/test-usage/${id}`),

  // CSV export
  exportItemsUrl: () => `${BASE_URL}/inventory/export/items.csv`,
  exportTransactionsUrl: () => `${BASE_URL}/inventory/export/transactions.csv`,
  exportTemplateUrl: () => `${BASE_URL}/inventory/export/template.csv`,

  downloadCsv: async (endpoint: string, filename: string) => {
    const res = await api.get(endpoint, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  },

  // CSV import
  importItems: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<CsvImportResult>("/inventory/import/items", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

// ─── Quotations ───────────────────────────────────────────────────────────────
export const quotationsApi = {
  list: () => api.get<Quotation[]>("/quotations"),
  get: (id: number) => api.get<Quotation>(`/quotations/${id}`),
  create: (data: {
    customer_id: number;
    items: QuotationItem[];
    vat_rate?: number;
    currency?: string;
    valid_until?: string;
    notes?: string;
    terms?: string;
  }) => api.post<Quotation>("/quotations", data),
  update: (
    id: number,
    data: Partial<{
      items: QuotationItem[];
      vat_rate: number;
      currency: string;
      valid_until: string;
      notes: string;
      terms: string;
      status: string;
    }>
  ) => api.put<Quotation>(`/quotations/${id}`, data),
  delete: (id: number) => api.delete(`/quotations/${id}`),
  send: (id: number, data: { to?: string[]; subject?: string; message?: string }) =>
    api.post<Quotation>(`/quotations/${id}/send`, data),
  pdfUrl: (id: number) => `${BASE_URL}/quotations/${id}/pdf`,
  downloadPdf: async (id: number, quoteNumber: string) => {
    const res = await api.get(`/quotations/${id}/pdf`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${quoteNumber.replace(/\//g, "_")}.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  },
};

// ─── Test Catalog ─────────────────────────────────────────────────────────────
export const testCatalogApi = {
  list: (params?: { category?: TestCategory; water_type?: string; active_only?: boolean }) =>
    api.get<TestCatalogItem[]>("/test-catalog", { params }),
  create: (data: Partial<TestCatalogItem>) => api.post<TestCatalogItem>("/test-catalog", data),
  update: (id: number, data: Partial<TestCatalogItem>) =>
    api.put<TestCatalogItem>(`/test-catalog/${id}`, data),
  delete: (id: number) => api.delete(`/test-catalog/${id}`),
  seed: () => api.post<{ added: number; message: string }>("/test-catalog/seed"),
};
