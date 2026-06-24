"use client";

import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import type { Customer } from "@/lib/types";

interface CustomerSearchProps {
  customers: Customer[];
  value?: number;
  onChange: (id: number | undefined) => void;
  label?: string;
  error?: string;
  placeholder?: string;
  required?: boolean;
}

export function CustomerSearch({
  customers,
  value,
  onChange,
  label = "Customer",
  error,
  placeholder = "Search customers…",
  required,
}: CustomerSearchProps) {
  const selected = customers.find((c) => c.id === value);
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(selected?.name ?? "");
  }, [selected?.name]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (!selected) setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selected]);

  const filtered = query.trim()
    ? customers.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        (c.contact_person ?? "").toLowerCase().includes(query.toLowerCase()) ||
        (c.email ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : customers;

  const handleSelect = (c: Customer) => {
    onChange(c.id);
    setQuery(c.name);
    setOpen(false);
  };

  const handleClear = () => {
    onChange(undefined);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange(undefined); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={`w-full pl-9 pr-8 py-2 border rounded-lg text-sm outline-none focus:ring-1 ${
            error
              ? "border-red-400 focus:ring-red-400"
              : "border-gray-300 focus:border-primary-400 focus:ring-primary-400"
          }`}
        />
        {(query || value) && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.slice(0, 50).map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(c)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-primary-50 border-b border-gray-50 last:border-0 ${
                c.id === value ? "bg-primary-50 text-primary-700 font-medium" : "text-gray-800"
              }`}
            >
              <span className="font-medium">{c.name}</span>
              {c.contact_person && (
                <span className="ml-2 text-xs text-gray-500">{c.contact_person}</span>
              )}
              {c.email && (
                <span className="block text-xs text-gray-400">{c.email}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
