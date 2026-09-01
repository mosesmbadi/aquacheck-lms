"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Pencil, X, Check, Download, Eye, ChevronDown, ChevronUp, Plus, Trash2, FilePlus, Upload, FileUp } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { documentsApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import type { Document, DocumentCategory, DocumentSection, DocumentStatus } from "@/lib/types";

// ─── Static catalogue — shown immediately, overridden by live API data ────────

const STATIC_SOPS: Document[] = [
  { id: 0, code: "SOP-02", title: "Control of Records and Information Procedure",       category: "sop", version: "2.0", status: "active", content: [], created_at: "", updated_at: "" },
  { id: 0, code: "SOP-03", title: "Control and Approval of Documents Procedures",       category: "sop", version: "1.0", status: "active", content: [], created_at: "", updated_at: "" },
  { id: 0, code: "SOP-04", title: "Complaints Management Procedure",                    category: "sop", version: "1.0", status: "active", content: [], created_at: "", updated_at: "" },
  { id: 0, code: "SOP-05", title: "Internal Audit and Systems Review Procedure",        category: "sop", version: "1.0", status: "active", content: [], created_at: "", updated_at: "" },
  { id: 0, code: "SOP-06", title: "Continuous Improvement Process Procedure",           category: "sop", version: "1.0", status: "active", content: [], created_at: "", updated_at: "" },
  { id: 0, code: "SOP-07", title: "Customer Services Management Procedure",             category: "sop", version: "1.0", status: "active", content: [], created_at: "", updated_at: "" },
  { id: 0, code: "SOP-08", title: "Purchasing and Supply Services",                     category: "sop", version: "2.0", status: "active", content: [], created_at: "", updated_at: "" },
  { id: 0, code: "SOP-09", title: "Quality Control Schemes Procedure",                  category: "sop", version: "1.0", status: "active", content: [], created_at: "", updated_at: "" },
  { id: 0, code: "SOP-10", title: "Equipment Management Procedure",                     category: "sop", version: "1.0", status: "active", content: [], created_at: "", updated_at: "" },
  { id: 0, code: "SOP-11", title: "Quality Assurance System Procedure",                 category: "sop", version: "1.0", status: "active", content: [], created_at: "", updated_at: "" },
  { id: 0, code: "SOP-12", title: "Method Validation Procedure",                        category: "sop", version: "1.0", status: "active", content: [], created_at: "", updated_at: "" },
  { id: 0, code: "SOP-13", title: "Staff Training and Development",                     category: "sop", version: "1.0", status: "active", content: [], created_at: "", updated_at: "" },
  { id: 0, code: "SOP-14", title: "Waste Disposal Procedure",                           category: "sop", version: "1.0", status: "active", content: [], created_at: "", updated_at: "" },
  { id: 0, code: "SOP-15", title: "Review of Requests, Tenders and Contracts",          category: "sop", version: "1.0", status: "active", content: [], created_at: "", updated_at: "" },
  { id: 0, code: "SOP-16", title: "Subcontracting of Tests",                            category: "sop", version: "1.0", status: "active", content: [], created_at: "", updated_at: "" },
  { id: 0, code: "SOP-17", title: "Sample Collection, Handling and Storage Procedure",  category: "sop", version: "1.0", status: "active", content: [], created_at: "", updated_at: "" },
  { id: 0, code: "SOP-18", title: "Chain of Custody Procedure",                         category: "sop", version: "1.0", status: "active", content: [], created_at: "", updated_at: "" },
  { id: 0, code: "SOP-19", title: "Sample Reception and Handling Procedure",            category: "sop", version: "1.0", status: "active", content: [], created_at: "", updated_at: "" },
];

const STATIC_MASTERLISTS: Document[] = [
  { id: 0, code: "AQCMSTR01", title: "Master List of External Documents", category: "masterlist", version: "1.0", status: "active", content: [], created_at: "", updated_at: "" },
  { id: 0, code: "AQCMSTR02", title: "Master List of Equipment",          category: "masterlist", version: "1.0", status: "active", content: [], created_at: "", updated_at: "" },
  { id: 0, code: "AQCMSTR03", title: "Master List of Forms",              category: "masterlist", version: "1.0", status: "active", content: [], created_at: "", updated_at: "" },
  { id: 0, code: "AQCMSTR04", title: "Master List of SOPs",               category: "masterlist", version: "1.0", status: "active", content: [], created_at: "", updated_at: "" },
];

function mergeWithApi(staticList: Document[], apiList: Document[]): Document[] {
  if (!apiList.length) return staticList;
  const byCode = Object.fromEntries(apiList.map((d) => [d.code, d]));
  const staticCodes = new Set(staticList.map((s) => s.code));
  const merged = staticList.map((s) => byCode[s.code] ?? s);
  const apiOnly = apiList.filter((d) => !staticCodes.has(d.code));
  return [...merged, ...apiOnly];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<DocumentStatus, string> = {
  active:       "bg-green-50 text-green-700 border border-green-200",
  under_review: "bg-yellow-50 text-yellow-700 border border-yellow-200",
  superseded:   "bg-gray-100 text-gray-500 border border-gray-200",
};
const STATUS_LABELS: Record<DocumentStatus, string> = {
  active: "Active", under_review: "Under Review", superseded: "Superseded",
};

// ─── PDF Preview panel ────────────────────────────────────────────────────────

function PdfPreview({ doc, onClose }: { doc: Document; onClose: () => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (doc.id === 0) {
      setError("backend_offline");
      setLoading(false);
      return;
    }
    documentsApi.previewBlobUrl(doc.id)
      .then((url) => { setBlobUrl(url); setLoading(false); })
      .catch(() => { setError("Could not generate preview."); setLoading(false); });
    return () => { if (blobUrl) window.URL.revokeObjectURL(blobUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  function handleDownload() {
    if (doc.id === 0) return;
    setDownloading(true);
    documentsApi.downloadPdf(doc.id, doc.code, doc.version).finally(() => setDownloading(false));
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-4xl h-full bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-200 flex-shrink-0">
          <div className="min-w-0">
            <span className="font-mono text-xs font-bold text-primary-600">{doc.code}</span>
            <p className="text-sm font-semibold text-gray-900 truncate">{doc.title}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button size="sm" variant="secondary" loading={downloading} onClick={handleDownload}>
              <Download className="w-3.5 h-3.5" /> Download PDF
            </Button>
            <button onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden bg-gray-100">
          {loading && (
            <div className="flex items-center justify-center h-full gap-2 text-gray-500 text-sm">
              <svg className="animate-spin h-5 w-5 text-primary-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generating PDF…
            </div>
          )}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
              {error === "backend_offline" ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-yellow-50 flex items-center justify-center">
                    <svg className="w-6 h-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-800">Backend not connected</p>
                  <p className="text-xs text-gray-500 max-w-xs">
                    Document content is loaded from the server. Restart the backend container to import and preview documents.
                  </p>
                  <code className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg font-mono">
                    docker compose restart backend
                  </code>
                </>
              ) : (
                <p className="text-sm text-gray-500">{error}</p>
              )}
            </div>
          )}
          {blobUrl && !loading && (
            <iframe src={blobUrl} className="w-full h-full border-0" title={doc.title} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Section editor (admin only) ──────────────────────────────────────────────

function SectionEditor({
  sections,
  onChange,
}: {
  sections: DocumentSection[];
  onChange: (s: DocumentSection[]) => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(0);

  function update(i: number, field: keyof DocumentSection, val: string) {
    const next = sections.map((s, idx) => idx === i ? { ...s, [field]: val } : s);
    onChange(next);
  }
  function remove(i: number) { onChange(sections.filter((_, idx) => idx !== i)); }
  function add() {
    onChange([...sections, { heading: "", body: "" }]);
    setExpanded(sections.length);
  }

  return (
    <div className="space-y-2">
      {sections.map((sec, i) => (
        <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded(expanded === i ? null : i)}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
          >
            <span className="text-sm font-medium text-gray-700 truncate">
              {sec.heading || <span className="text-gray-400 italic">Untitled section</span>}
            </span>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(i); }}
                className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              {expanded === i ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </div>
          </button>
          {expanded === i && (
            <div className="p-3 space-y-2 bg-white">
              <Input
                label="Heading"
                value={sec.heading}
                onChange={(e) => update(i, "heading", e.target.value)}
                placeholder="e.g. 1.0 Purpose"
              />
              <Textarea
                label="Body"
                value={sec.body}
                rows={5}
                onChange={(e) => update(i, "body", e.target.value)}
                placeholder="Section content…"
              />
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 px-2 py-1.5 rounded-lg hover:bg-primary-50 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Add section
      </button>
    </div>
  );
}

// ─── Add Document Modal ───────────────────────────────────────────────────────

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_FILE_TYPES = new Set([".pdf", ".docx"]);

function validateDocFile(file: File): string | null {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_FILE_TYPES.has(ext)) return "Only PDF and DOCX files are accepted.";
  if (file.size > MAX_FILE_SIZE) return "File exceeds the 20 MB limit.";
  return null;
}

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  sop: "SOP",
  masterlist: "Master List",
  user_guide: "User Guide",
  forms: "Forms",
  external_documents: "External Documents",
};

function AddDocumentModal({
  defaultCategory,
  onClose,
}: {
  defaultCategory: DocumentCategory;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"write" | "upload">("write");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    code: "",
    title: "",
    category: defaultCategory,
    version: "1.0",
    status: "active" as DocumentStatus,
    effective_date: "",
    description: "",
    content: [] as DocumentSection[],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const created = await documentsApi.create({
        code: form.code.trim(),
        title: form.title.trim(),
        category: form.category,
        version: form.version.trim() || "1.0",
        status: form.status,
        effective_date: form.effective_date || undefined,
        description: form.description.trim() || undefined,
        content: mode === "write" ? form.content : [],
      });
      if (mode === "upload" && selectedFile) {
        await documentsApi.uploadFile(created.data.id, selectedFile);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Failed to save document. Please try again.");
    },
  });

  function handleSubmit() {
    setError(null);
    if (!form.code.trim()) return setError("Document code is required.");
    if (!form.title.trim()) return setError("Title is required.");
    if (mode === "upload" && !selectedFile) return setError("Please select a file to upload.");
    createMutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <FilePlus className="w-5 h-5 text-primary-600" />
            <h2 className="text-base font-bold text-gray-900">Add Document</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode switcher */}
        <div className="px-6 pt-4 flex-shrink-0">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            <button
              onClick={() => setMode("write")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === "write" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Pencil className="w-3.5 h-3.5" /> Write Document
            </button>
            <button
              onClick={() => setMode("upload")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === "upload" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Upload className="w-3.5 h-3.5" /> Upload File
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Document Code *"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="e.g. SOP-20"
            />
            <Select
              label="Category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as DocumentCategory }))}
            >
              {(Object.keys(CATEGORY_LABELS) as DocumentCategory[]).map((cat) => (
                <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
              ))}
            </Select>
            <div className="col-span-2">
              <Input
                label="Title *"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Sample Disposal Procedure"
              />
            </div>
            <Input
              label="Version"
              value={form.version}
              onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
              placeholder="1.0"
            />
            <Select
              label="Status"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as DocumentStatus }))}
            >
              <option value="active">Active</option>
              <option value="under_review">Under Review</option>
              <option value="superseded">Superseded</option>
            </Select>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Effective Date</label>
              <input
                type="date"
                value={form.effective_date}
                onChange={(e) => setForm((f) => ({ ...f, effective_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none"
              />
            </div>
            <div className="col-span-2">
              <Textarea
                label="Description"
                value={form.description}
                rows={2}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of this document…"
              />
            </div>
          </div>

          {/* Write mode: section editor */}
          {mode === "write" && (
            <div>
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Content Sections</p>
              <SectionEditor
                sections={form.content}
                onChange={(content) => setForm((f) => ({ ...f, content }))}
              />
            </div>
          )}

          {/* Upload mode: file picker */}
          {mode === "upload" && (
            <div>
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">File</p>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f) {
                    const validationError = validateDocFile(f);
                    if (validationError) {
                      setError(validationError);
                      setSelectedFile(null);
                      if (fileRef.current) fileRef.current.value = "";
                      return;
                    }
                  }
                  setError(null);
                  setSelectedFile(f);
                }}
              />
              {selectedFile ? (
                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-primary-50 border border-primary-200 rounded-xl">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                    className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-300 hover:border-primary-400 rounded-xl px-6 py-8 flex flex-col items-center gap-2 text-gray-400 hover:text-primary-600 transition-colors group"
                >
                  <Upload className="w-8 h-8" />
                  <span className="text-sm font-medium">Click to select a file</span>
                  <span className="text-xs">PDF or DOCX — max 20 MB</span>
                </button>
              )}
              <p className="text-xs text-gray-500 mt-2">
                PDF files are served as-is. DOCX files are parsed and content is extracted automatically.
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={createMutation.isPending} onClick={handleSubmit}>
            {mode === "upload" ? "Create & Upload" : "Create Document"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Document card ────────────────────────────────────────────────────────────

function DocumentCard({ doc, isAdmin }: { doc: Document; isAdmin: boolean }) {
  const qc = useQueryClient();
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [previewing, setPreviewing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title:          doc.title,
    version:        doc.version,
    status:         doc.status,
    effective_date: doc.effective_date ?? "",
    description:    doc.description ?? "",
    content:        doc.content as DocumentSection[],
  });

  // Keep form in sync when API data arrives
  useEffect(() => {
    setForm({
      title:          doc.title,
      version:        doc.version,
      status:         doc.status,
      effective_date: doc.effective_date ?? "",
      description:    doc.description ?? "",
      content:        doc.content as DocumentSection[],
    });
  }, [doc]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await documentsApi.update(doc.id, {
        title:          form.title,
        version:        form.version,
        status:         form.status,
        effective_date: form.effective_date || undefined,
        description:    form.description || undefined,
        content:        form.content,
      });
      if (replaceFile) {
        await documentsApi.uploadFile(doc.id, replaceFile);
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documents"] }); setMode("view"); setReplaceFile(null); },
  });

  function handleDownload() {
    if (doc.id === 0) return;
    setDownloading(true);
    documentsApi.downloadPdf(doc.id, doc.code, doc.version).finally(() => setDownloading(false));
  }

  // ── Edit mode ──────────────────────────────────────────────────────────────
  if (mode === "edit") {
    return (
      <div className="bg-white rounded-xl border border-primary-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Editing — <span className="text-primary-600">{doc.code}</span>
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setMode("view")}>
              <X className="w-3.5 h-3.5" /> Cancel
            </Button>
            <Button size="sm" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              <Check className="w-3.5 h-3.5" /> Save
            </Button>
          </div>
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Input label="Title" value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <Input label="Version" value={form.version}
            onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} />
          <Select label="Status" value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as DocumentStatus }))}>
            <option value="active">Active</option>
            <option value="under_review">Under Review</option>
            <option value="superseded">Superseded</option>
          </Select>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Effective Date</label>
            <input type="date" value={form.effective_date}
              onChange={(e) => setForm((f) => ({ ...f, effective_date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none" />
          </div>
          <div className="col-span-2">
            <Textarea label="Description" value={form.description} rows={2}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
        </div>

        {/* Uploaded file — replace */}
        {doc.uploaded_file && (
          <div>
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Uploaded PDF</p>
            <input
              ref={replaceFileRef}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f) {
                  const validationError = validateDocFile(f);
                  if (validationError) {
                    setFileError(validationError);
                    setReplaceFile(null);
                    if (replaceFileRef.current) replaceFileRef.current.value = "";
                    return;
                  }
                }
                setFileError(null);
                setReplaceFile(f);
              }}
            />
            {fileError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">{fileError}</p>
            )}
            {replaceFile ? (
              <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg">
                <div className="flex items-center gap-2 min-w-0">
                  <FileUp className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-900 truncate">{replaceFile.name}</span>
                  <span className="text-xs text-gray-500 flex-shrink-0">{(replaceFile.size / 1024).toFixed(1)} KB</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setReplaceFile(null); if (replaceFileRef.current) replaceFileRef.current.value = ""; }}
                  className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-3 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg">
                <FileUp className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                <span className="text-sm text-indigo-700">A PDF file is attached to this document.</span>
                <button
                  type="button"
                  onClick={() => replaceFileRef.current?.click()}
                  className="ml-auto text-xs font-medium text-indigo-600 hover:text-indigo-800 underline flex-shrink-0"
                >
                  Replace file
                </button>
              </div>
            )}
          </div>
        )}

        {/* Content sections */}
        <div>
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Content Sections</p>
          <SectionEditor
            sections={form.content}
            onChange={(content) => setForm((f) => ({ ...f, content }))}
          />
        </div>
      </div>
    );
  }

  // ── View mode ──────────────────────────────────────────────────────────────
  const hasUploadedFile = Boolean(doc.uploaded_file);

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:border-gray-300 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="flex-shrink-0 mt-0.5 font-mono text-xs font-bold text-primary-600 bg-primary-50 px-2 py-1 rounded">
              {doc.code}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 leading-snug">{doc.title}</p>
              {doc.description && (
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{doc.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {hasUploadedFile && (
              <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                <FileUp className="w-3 h-3" /> Uploaded PDF
              </span>
            )}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[doc.status]}`}>
              {STATUS_LABELS[doc.status]}
            </span>

            <button onClick={() => setPreviewing(true)}
              title="Preview PDF"
              className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-primary-600 hover:bg-primary-50">
              <Eye className="w-3.5 h-3.5" />
            </button>

            <button onClick={handleDownload} disabled={downloading || doc.id === 0}
              title="Download PDF"
              className="p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-primary-600 hover:bg-primary-50">
              <Download className="w-3.5 h-3.5" />
            </button>

            {isAdmin && (
              <button onClick={() => setMode("edit")} title="Edit document"
                className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 flex-wrap text-xs text-gray-500">
          <span><span className="font-medium">Version:</span> {doc.version}</span>
          {doc.effective_date && (
            <span>
              <span className="font-medium">Effective:</span>{" "}
              {format(parseISO(doc.effective_date), "MMM d, yyyy")}
            </span>
          )}
          <span className="ml-auto">
            {hasUploadedFile
              ? <span className="flex items-center gap-1 text-indigo-600"><FileUp className="w-3 h-3" /> Uploaded PDF</span>
              : doc.content.length > 0
                ? `${doc.content.length} sections`
                : <span className="text-gray-400 italic">No content yet</span>}
          </span>
        </div>
      </div>

      {previewing && <PdfPreview doc={doc} onClose={() => setPreviewing(false)} />}
    </>
  );
}

// ─── Document list ────────────────────────────────────────────────────────────

function DocumentList({ staticDocs, isAdmin, category: catOverride }: { staticDocs: Document[]; isAdmin: boolean; category?: string }) {
  const category = (catOverride ?? staticDocs[0]?.category) as import("@/lib/types").DocumentCategory | undefined;
  const { data: apiDocs = [] } = useQuery({
    queryKey: ["documents", category],
    queryFn: () => documentsApi.list(category).then((r) => r.data),
    retry: false,
  });
  const docs = staticDocs.length > 0 ? mergeWithApi(staticDocs, apiDocs) : apiDocs;
  if (docs.length === 0) {
    return <p className="text-sm text-gray-400 italic py-4">No documents in this category yet.</p>;
  }
  return (
    <div className="space-y-3">
      {docs.map((doc) => (
        <DocumentCard key={doc.code} doc={doc} isAdmin={isAdmin} />
      ))}
    </div>
  );
}

// ─── User Guide sections ──────────────────────────────────────────────────────

const guideContent = [
  {
    title: "1. Register a Sample",
    content: `Navigate to **Dashboard → Samples** and click the **"Register Sample"** button.`,
    table: {
      headers: ["Field", "Required", "Example"],
      rows: [
        ["Contract", "No", "Select a contract or leave blank for standalone sample"],
        ["Sample Type", "Yes", "Water, Soil, Air"],
        ["Description", "No", "Borehole water sample"],
        ["Collection Date", "No", "2026-03-15"],
        ["Collection Location", "No", "Site A, Borehole 3"],
        ["GPS Coordinates", "No", "-1.2921, 36.8219"],
        ["Storage Condition", "No", "4°C, dark"],
      ],
    },
    notes: [
      "A unique sample code is generated automatically (e.g. AQ-2026-00001).",
      "A QR barcode is created for the sample.",
      "Standalone samples can be registered without a contract, but cannot proceed to testing until linked to one.",
      "Every action is recorded in the audit trail.",
    ],
  },
  {
    title: "2. Add Test Results to a Sample",
    content: `Navigate to **Dashboard → Test Results** and click the **"New Test"** button.`,
    table: {
      headers: ["Field", "Required", "Example"],
      rows: [
        ["Sample", "Yes", "AQ-2026-00001"],
        ["Method", "Yes", "SM 4500-H+ — pH Measurement"],
        ["Result Value", "No (can add later)", "7.2"],
        ["Result Unit", "No", "mg/L, NTU"],
        ["Notes", "No", "Free text observations"],
      ],
    },
    notes: [],
  },
  {
    title: "3. Test Result Lifecycle",
    content: "Each test result follows a status workflow:",
    steps: [
      { label: "Pending",     desc: "Test created but not yet started." },
      { label: "In Progress", desc: "Automatically set when the test is created." },
      { label: "Completed",   desc: "Automatically set when a result value is entered." },
      { label: "Validated",   desc: "An Admin or Quality Manager clicks 'Validate' to approve." },
    ],
    notes: ["Only Admin or Quality Manager roles can validate results."],
  },
  {
    title: "4. Overall Workflow",
    content: "",
    steps: [
      { label: "Step 1", desc: "Create a Contract (Dashboard → Contracts)." },
      { label: "Step 2", desc: "Register samples against the contract (Dashboard → Samples)." },
      { label: "Step 3", desc: "Record and validate test results (Dashboard → Tests)." },
      { label: "Step 4", desc: "Generate reports from validated results (Dashboard → Reports)." },
    ],
    notes: [],
  },
];

function renderMd(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/).map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = "guide" | "sops" | "masterlists" | "forms" | "external_documents";

const TAB_CATEGORY: Partial<Record<Tab, DocumentCategory>> = {
  sops: "sop",
  masterlists: "masterlist",
  forms: "forms",
  external_documents: "external_documents",
};

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("guide");
  const [showAddModal, setShowAddModal] = useState(false);
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === "admin";

  const tabs: { id: Tab; label: string }[] = [
    { id: "guide",              label: "User Guide" },
    { id: "sops",               label: "SOPs" },
    { id: "masterlists",        label: "Master List" },
    { id: "forms",              label: "Forms" },
    { id: "external_documents", label: "External Documents" },
  ];

  return (
    <DashboardLayout title="Documentation">
      <div className="max-w-4xl space-y-6">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── User Guide ─────────────────────────────────────────────────── */}
        {activeTab === "guide" && (
          <div className="space-y-8">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-1">AquaCheck LIMS — User Guide</h2>
              <p className="text-sm text-gray-500">
                How to register samples, record test results, and navigate the validation workflow.
              </p>
            </div>
            {guideContent.map((sec) => (
              <div key={sec.title} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
                <h3 className="text-base font-bold text-gray-900">{sec.title}</h3>
                {sec.content && <p className="text-sm text-gray-600">{renderMd(sec.content)}</p>}
                {sec.table && (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>{sec.table.headers.map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left font-semibold text-gray-700 border-b border-gray-200">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {sec.table.rows.map((row, ri) => (
                          <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-4 py-2 text-gray-600 border-b border-gray-100">
                                {ci === 1
                                  ? <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cell === "Yes" ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-600"}`}>{cell}</span>
                                  : cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {"steps" in sec && sec.steps && (
                  <div className="space-y-2">
                    {sec.steps.map((step, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center text-xs font-bold mt-0.5">{i + 1}</span>
                        <p className="text-sm text-gray-600"><span className="font-semibold text-gray-800">{step.label}</span> — {step.desc}</p>
                      </div>
                    ))}
                  </div>
                )}
                {sec.notes.length > 0 && (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-1">
                    <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">Note</p>
                    {sec.notes.map((n, i) => <p key={i} className="text-sm text-blue-700">• {n}</p>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── SOPs ───────────────────────────────────────────────────────── */}
        {activeTab === "sops" && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-gray-900">Standard Operating Procedures</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Controlled documents governing laboratory operations per ISO/IEC 17025.{" "}
                  {isAdmin
                    ? "Click the pencil icon to edit any document's content."
                    : "Click the eye icon to preview, or the download icon to save a PDF copy."}
                </p>
              </div>
              {isAdmin && (
                <Button size="sm" onClick={() => setShowAddModal(true)}>
                  <FilePlus className="w-3.5 h-3.5" /> Add Document
                </Button>
              )}
            </div>
            <DocumentList staticDocs={STATIC_SOPS} isAdmin={isAdmin} />
          </div>
        )}

        {/* ── Master List ────────────────────────────────────────────────── */}
        {activeTab === "masterlists" && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-gray-900">Master Lists</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Registry of controlled documents, equipment, forms, and procedures.{" "}
                  {isAdmin
                    ? "Click the pencil icon to edit any document's content."
                    : "Click the eye icon to preview, or the download icon to save a PDF copy."}
                </p>
              </div>
              {isAdmin && (
                <Button size="sm" onClick={() => setShowAddModal(true)}>
                  <FilePlus className="w-3.5 h-3.5" /> Add Document
                </Button>
              )}
            </div>
            <DocumentList staticDocs={STATIC_MASTERLISTS} isAdmin={isAdmin} />
          </div>
        )}

        {/* ── Forms ──────────────────────────────────────────────────────── */}
        {activeTab === "forms" && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-gray-900">Forms</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Laboratory forms and templates used in daily operations.{" "}
                  {isAdmin
                    ? "Click the pencil icon to edit any document's content."
                    : "Click the eye icon to preview, or the download icon to save a PDF copy."}
                </p>
              </div>
              {isAdmin && (
                <Button size="sm" onClick={() => setShowAddModal(true)}>
                  <FilePlus className="w-3.5 h-3.5" /> Add Document
                </Button>
              )}
            </div>
            <DocumentList staticDocs={[]} isAdmin={isAdmin} category="forms" />
          </div>
        )}

        {/* ── External Documents ─────────────────────────────────────────── */}
        {activeTab === "external_documents" && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-gray-900">External Documents</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  External standards, regulations, and reference documents (KEBS, NEMA, WHO, etc.).{" "}
                  {isAdmin
                    ? "Click the pencil icon to edit any document's content."
                    : "Click the eye icon to preview, or the download icon to save a PDF copy."}
                </p>
              </div>
              {isAdmin && (
                <Button size="sm" onClick={() => setShowAddModal(true)}>
                  <FilePlus className="w-3.5 h-3.5" /> Add Document
                </Button>
              )}
            </div>
            <DocumentList staticDocs={[]} isAdmin={isAdmin} category="external_documents" />
          </div>
        )}
      </div>

      {showAddModal && TAB_CATEGORY[activeTab] && (
        <AddDocumentModal
          defaultCategory={TAB_CATEGORY[activeTab]!}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </DashboardLayout>
  );
}
