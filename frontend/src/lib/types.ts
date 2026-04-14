// ─── Enums ───────────────────────────────────────────────────────────────────

export type TestCategory = "physicochemical" | "microbiological";

export type UserRole =
  | "admin"
  | "manager"
  | "technician"
  | "quality_manager"
  | "customer"
  | "auditor";

export type ContractStatus =
  | "draft"
  | "under_review"
  | "approved"
  | "rejected"
  | "completed";

export type MethodStatus = "draft" | "validated" | "deprecated";
// Method type kept for DB compatibility — no longer exposed in UI
export interface Method {
  id: number;
  code: string;
  name: string;
  description?: string;
  standard_reference?: string;
  version: string;
  status: MethodStatus;
  created_at: string;
  updated_at: string;
}

export type SampleStatus =
  | "received"
  | "registered"
  | "assigned"
  | "in_testing"
  | "completed"
  | "archived"
  | "disposed";

export type TestStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "validated"
  | "failed";

export type EquipmentStatus =
  | "active"
  | "in_calibration"
  | "out_of_service"
  | "decommissioned";

export type ReportType =
  | "test_report"
  | "calibration_certificate"
  | "sampling_report"
  | "conformity_statement";

export type ReportStatus = "draft" | "under_review" | "issued" | "amended";

export type ComplaintStatus =
  | "received"
  | "under_investigation"
  | "corrective_action"
  | "closed";

export type NonconformityStatus =
  | "identified"
  | "suspended"
  | "under_review"
  | "corrective_action"
  | "closed";

export type RiskLevel = "low" | "medium" | "high";

export interface TestCatalogItem {
  id: number;
  name: string;
  category: TestCategory;
  unit?: string;
  method_name?: string;
  standard_limit?: string;
  description?: string;
  price?: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Quotations ───────────────────────────────────────────────────────────────
export type QuotationStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

export interface QuotationItem {
  catalog_item_id?: number | null;
  name: string;
  unit?: string | null;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Quotation {
  id: number;
  quote_number: string;
  customer_id: number;
  customer_name?: string | null;
  items: QuotationItem[];
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  currency: string;
  status: QuotationStatus;
  valid_until?: string | null;
  notes?: string | null;
  terms?: string | null;
  sent_to?: string | null;
  sent_at?: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Models ──────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  customer_id?: number;
  is_contact_person?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: number;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  organization_type?: string;
  currency?: string;
  is_active: boolean;
  created_at: string;
}

export interface Contract {
  id: number;
  contract_number: string;
  customer_id: number;
  title: string;
  scope_of_work?: string;
  requested_tests?: unknown[];
  decision_rules?: string;
  status: ContractStatus;
  reviewed_by?: number;
  approved_by?: number;
  submitted_at?: string;
  reviewed_at?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Method {
  id: number;
  code: string;
  name: string;
  description?: string;
  standard_reference?: string;
  version: string;
  status: MethodStatus;
  validation_date?: string;
  performance_characteristics?: Record<string, unknown>;
  measurement_uncertainty_info?: Record<string, unknown>;
  created_by?: number;
  created_at: string;
  updated_at: string;
}

export interface Sample {
  id: number;
  sample_code: string;
  customer_id?: number;
  contract_id?: number;
  description?: string;
  sample_type?: string;
  collection_date?: string;
  collection_location?: string;
  gps_coordinates?: string;
  received_by?: number;
  received_at: string;
  storage_condition?: string;
  status: SampleStatus;
  barcode_data?: string;
  disposal_date?: string;
  disposal_method?: string;
  chain_of_custody?: CustodyEntry[];
  requested_test_ids?: number[];
  created_at: string;
  updated_at: string;
}

export interface CustodyEntry {
  user_id: number;
  action: string;
  timestamp: string;
}

export interface TestResult {
  id: number;
  sample_id: number;
  method_id: number;
  catalog_item_id?: number;
  assigned_to?: number;
  equipment_ids?: number[];
  raw_observations?: Record<string, unknown>;
  result_value?: string;
  result_unit?: string;
  uncertainty_value?: number;
  uncertainty_unit?: string;
  status: TestStatus;
  started_at?: string;
  completed_at?: string;
  validated_by?: number;
  validated_at?: string;
  notes?: string;
  amendments?: unknown[];
  created_at: string;
  updated_at: string;
}

export interface Equipment {
  id: number;
  equipment_id: string;
  name: string;
  model?: string;
  manufacturer?: string;
  serial_number?: string;
  status: EquipmentStatus;
  calibration_due_date?: string;
  last_calibration_date?: string;
  calibration_certificate_ref?: string;
  location?: string;
  created_at: string;
  updated_at: string;
}

export interface Report {
  id: number;
  report_number: string;
  contract_id: number;
  report_type: ReportType;
  status: ReportStatus;
  content?: {
    sample_id?: number;
    client_reference?: string;
    report_title?: string;
    overall_status?: string;
    classification?: string;
    submitted_by?: string;
    client_contact?: string;
    sampled_by?: string;
    sampling_location?: string;
    sampling_date?: string;
    received_on?: string;
    analysis_date?: string;
    report_issued_on?: string;
    sample_lab_id?: string;
    specification_title?: string;
    ns_definition?: string;
    disclaimer?: string;
    authorizer_name?: string;
    authorizer_title?: string;
    analyst_name?: string;
    analyst_title?: string;
    result_sections?: Array<{
      title: string;
      specification_header?: string;
      rows: Array<{
        parameter: string;
        method: string;
        result: string;
        specification: string;
        remarks: string;
      }>;
    }>;
    final_comment?: string;
    sample_description?: string;
    [key: string]: unknown;
  };
  issued_by?: number;
  issued_at?: string;
  pdf_path?: string;
  digital_signature?: string;
  revision_history?: unknown[];
  created_at: string;
  updated_at: string;
}

export interface Complaint {
  id: number;
  complaint_number: string;
  customer_id: number;
  contract_id?: number;
  description: string;
  reported_by?: string;
  status: ComplaintStatus;
  received_at: string;
  investigation_notes?: string;
  corrective_action?: string;
  closed_at?: string;
  closed_by?: number;
  created_at: string;
  updated_at: string;
}

export interface Nonconformity {
  id: number;
  nc_number: string;
  related_sample_id?: number;
  related_test_id?: number;
  description: string;
  risk_level: RiskLevel;
  identified_by?: number;
  identified_at: string;
  status: NonconformityStatus;
  work_suspended: boolean;
  investigation?: string;
  corrective_action?: string;
  customer_notified: boolean;
  closed_at?: string;
  closed_by?: number;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: number;
  user_id?: number;
  action: string;
  resource_type: string;
  resource_id?: string;
  old_value?: unknown;
  new_value?: unknown;
  ip_address?: string;
  created_at: string;
}

export interface PaginatedResponse<T> {
  total: number;
  items: T[];
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface QualityDashboard {
  open_nonconformities: number;
  open_ncs_by_risk: { high: number; medium: number; low: number };
  open_complaints: number;
  samples_in_testing: number;
  equipment_calibration_due: number;
}

export type DocumentCategory = "sop" | "masterlist";
export type DocumentStatus = "active" | "under_review" | "superseded";

export interface DocumentSection {
  heading: string;
  body: string;
}

export interface Document {
  id: number;
  code: string;
  title: string;
  category: DocumentCategory;
  version: string;
  status: DocumentStatus;
  effective_date?: string;
  description?: string;
  content: DocumentSection[];
  created_at: string;
  updated_at: string;
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export type InventoryCategory =
  | "reagent"
  | "standard"
  | "consumable"
  | "glassware"
  | "media"
  | "ppe"
  | "other";

export type TransactionType =
  | "receive"
  | "use"
  | "adjust"
  | "dispose"
  | "return_stock";

export interface InventoryItem {
  id: number;
  item_code: string;
  name: string;
  category: InventoryCategory;
  description?: string;
  unit: string;
  minimum_stock: number;
  current_stock: number;
  supplier?: string;
  catalog_number?: string;
  storage_location?: string;
  storage_conditions?: string;
  unit_cost?: number;
  is_active: number;
  is_low_stock: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryTransaction {
  id: number;
  item_id: number;
  transaction_type: TransactionType;
  quantity: number;
  balance_after: number;
  transaction_date: string;
  lot_number?: string;
  expiry_date?: string;
  supplier?: string;
  reference?: string;
  related_sample_id?: number;
  related_test_result_id?: number;
  performed_by?: number;
  notes?: string;
  created_at: string;
  item_name?: string;
  item_code?: string;
  item_unit?: string;
}

export interface InventoryStats {
  total_items: number;
  low_stock_count: number;
  expiring_soon_count: number;
  total_value: number;
}

export interface TestReagentUsage {
  id: number;
  catalog_item_id: number;
  inventory_item_id: number;
  quantity_per_test: number;
  notes?: string;
  created_at: string;
  catalog_item_name?: string;
  inventory_item_name?: string;
  inventory_item_code?: string;
  inventory_unit?: string;
  current_stock?: number;
}

export interface CsvImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}
