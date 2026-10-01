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
 * Whether a test is reported as accredited on this sample: the sample's own choice, or —
 * for samples registered before that existed — the list frozen onto the report when it
 * was issued, else the catalog.
 */
export function isAccredited(
  item: TestCatalogItem,
  sample?: Pick<Sample, "accredited_test_ids"> | null,
  frozenAccreditedIds?: unknown
): boolean {
  if (Array.isArray(sample?.accredited_test_ids)) return sample.accredited_test_ids.includes(item.id);
  if (Array.isArray(frozenAccreditedIds)) return frozenAccreditedIds.includes(item.id);
  return !!item.is_accredited;
}

/**
 * "✓" subcontracted, "*" accredited, "" neither. A subcontracted result never carries
 * the lab's accreditation mark — that covers only work the lab does itself.
 */
export function parameterMark(
  item: TestCatalogItem,
  sample?: Pick<Sample, "subcontracted_test_ids" | "accredited_test_ids"> | null,
  frozenAccreditedIds?: unknown
): string {
  if (sample?.subcontracted_test_ids?.includes(item.id)) return SUBCONTRACTED_MARK;
  return isAccredited(item, sample, frozenAccreditedIds) ? ACCREDITED_MARK : "";
}
