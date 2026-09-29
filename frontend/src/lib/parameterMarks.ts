import type { Sample, TestCatalogItem } from "@/lib/types";

// Mirrors parameter_mark() in backend/app/routers/reports.py, so the print view and
// the PDF mark the same parameters.

export const ACCREDITED_MARK = "*";
export const SUBCONTRACTED_MARK = "✓";

export const MARK_LEGEND = [
  { mark: ACCREDITED_MARK, label: "Accredited parameter" },
  { mark: SUBCONTRACTED_MARK, label: "Subcontracted parameter" },
] as const;

export const SYSTEM_GENERATED_NOTE = "This is a system generated document";

/**
 * "✓" subcontracted, "*" accredited, "" neither. Accreditation comes from the catalog,
 * or from the list frozen onto the report when it was issued. A subcontracted result
 * never carries the lab's accreditation mark — that covers only work the lab does itself.
 */
export function parameterMark(
  item: TestCatalogItem,
  sample?: Pick<Sample, "subcontracted_test_ids"> | null,
  frozenAccreditedIds?: unknown
): string {
  if (sample?.subcontracted_test_ids?.includes(item.id)) return SUBCONTRACTED_MARK;
  const accredited = Array.isArray(frozenAccreditedIds)
    ? frozenAccreditedIds.includes(item.id)
    : !!item.is_accredited;
  return accredited ? ACCREDITED_MARK : "";
}
