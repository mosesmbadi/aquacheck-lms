import axios, { AxiosInstance } from "axios";
import { getToken, logout } from "./auth";
import type {
  User, UserRole, Customer, Contract, Sample, TestResult,
  Equipment, Report, Complaint, Nonconformity, AuditLog,
  PaginatedResponse, LoginResponse, QualityDashboard, TestCatalogItem, TestCategory,
  Method,
} from "./types";

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000") + "/api/v1";

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
  register: (data: { email: string; password: string; full_name: string; role: UserRole }) =>
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

// ─── Test Catalog ─────────────────────────────────────────────────────────────
export const testCatalogApi = {
  list: (params?: { category?: TestCategory; active_only?: boolean }) =>
    api.get<TestCatalogItem[]>("/test-catalog", { params }),
  create: (data: Partial<TestCatalogItem>) => api.post<TestCatalogItem>("/test-catalog", data),
  update: (id: number, data: Partial<TestCatalogItem>) =>
    api.put<TestCatalogItem>(`/test-catalog/${id}`, data),
  delete: (id: number) => api.delete(`/test-catalog/${id}`),
  seed: () => api.post<{ added: number; message: string }>("/test-catalog/seed"),
};
