/**
 * Compliance evaluation for a test result against its standard limit.
 *
 * Single source of truth for the REMARKS column — used by the result entry screen and
 * by the printed test report. The vocabulary it relies on (ND, TNTC, Detected, Nil…)
 * comes from the `result_qualifiers` table, so the lab can teach the system a new token
 * without a code change. Mirror of `backend/app/services/compliance.py`; keep the two
 * in step.
 */
import type { ResultQualifier, TestCatalogItem, TestResult } from "./types";

export const COMPLIANT = "COMPLIANT";
export const NON_COMPLIANT = "NON-COMPLIANT";

/** Standard-limit placeholders meaning "no set standard" — remarks stay blank (printed NS). */
const NO_STANDARD = new Set(["", "-", "—", "–", "n/a", "na", "ns", "none", "no set standard"]);

const RANGE_RE = /^\s*([\d.]+)\s*[–-]\s*([\d.]+)\s*$/;
/** Leading comparator and trailing unit are tolerated: "≤ 100", "< 0.5", "100 mg/L". */
const NUMBER_RE = /-?\d+(?:\.\d+)?/;

const norm = (value?: string | null) => (value ?? "").trim().toLowerCase();

function toNumber(value?: string | null): number | null {
  const match = NUMBER_RE.exec(value ?? "");
  if (!match) return null;
  const num = parseFloat(match[0]);
  return isNaN(num) ? null : num;
}

/** Find the qualifier whose code or alias equals `value` (case-insensitive). */
export function matchQualifier(
  value: string | null | undefined,
  qualifiers: ResultQualifier[]
): ResultQualifier | null {
  const needle = norm(value);
  if (!needle) return null;
  for (const q of qualifiers) {
    if (q.kind !== "qualifier" || !q.is_active) continue;
    if (norm(q.code) === needle) return q;
    if ((q.aliases ?? []).some((alias) => norm(alias) === needle)) return q;
  }
  return null;
}

/**
 * Why the REMARKS column reads the way it does.
 *
 * These are deliberately distinct. "NS" on a test report is a factual claim — that no
 * standard exists for the parameter. Printing it when a standard *does* exist but the
 * result could not be evaluated would misrepresent the legend, so those cases are kept
 * apart and shown differently.
 */
export type RemarkKind =
  | "compliant"
  | "non_compliant"
  /** No specification set for this parameter — nothing to comply with. */
  | "no_standard"
  /** No result was entered. Never treated as a pass. */
  | "not_tested"
  /** Above the measurable range with no standard to fail against (e.g. TNTC vs "—"). */
  | "out_of_range"
  /** A standard exists but the result cannot be compared to it. */
  | "indeterminate"
  /** Rated on a scale rather than judged against a limit (e.g. contamination rating). */
  | "rating"
  /** Remark written by the analyst. */
  | "manual";

export interface Remark {
  kind: RemarkKind;
  /** What the printed test report shows in the REMARKS column. */
  label: string;
  /** Advisory for the analyst on the entry screen. Never printed for the customer. */
  advisory: string | null;
}

const REMARKS: Record<Exclude<RemarkKind, "rating" | "manual">, Remark> = {
  compliant: { kind: "compliant", label: COMPLIANT, advisory: null },
  non_compliant: { kind: "non_compliant", label: NON_COMPLIANT, advisory: null },
  no_standard: { kind: "no_standard", label: "NS", advisory: null },
  not_tested: {
    kind: "not_tested",
    label: "Not tested",
    advisory: "No result entered — this parameter cannot be reported.",
  },
  out_of_range: {
    kind: "out_of_range",
    // Still NS: there is genuinely no standard here, so no conformity statement is possible.
    label: "NS",
    advisory: "Out of measurable range — repeat at a higher dilution before reporting.",
  },
  indeterminate: {
    kind: "indeterminate",
    label: "—",
    advisory: "Result cannot be evaluated against this specification — check the entry.",
  },
};

/**
 * Evaluate one result against its standard limit.
 *
 * ISO/IEC 17025 §7.8.6: a statement of conformity requires a specification to state it
 * against. Where none exists we report NS and stop — an out-of-range result does not
 * become a failure just because it is large.
 */
export function evaluateRemark(
  standardLimit: string | null | undefined,
  resultValue: string | null | undefined,
  qualifiers: ResultQualifier[]
): Remark {
  const value = (resultValue ?? "").trim();
  const limit = (standardLimit ?? "").trim();

  if (!value) return REMARKS.not_tested;

  const resultQ = matchQualifier(value, qualifiers);

  if (NO_STANDARD.has(norm(limit))) {
    // TNTC with nothing to fail against: NS for the customer, but the analyst is told.
    return resultQ?.exceeds_limit ? REMARKS.out_of_range : REMARKS.no_standard;
  }

  const limitQ = matchQualifier(limit, qualifiers);

  // Qualitative limit demanding absence ("Not Detectable", "Nil", "Absent").
  if (limitQ && !limitQ.is_detected) {
    if (resultQ) return resultQ.is_detected ? REMARKS.non_compliant : REMARKS.compliant;
    const number = toNumber(value);
    if (number === null) return REMARKS.indeterminate;
    return number === 0 ? REMARKS.compliant : REMARKS.non_compliant;
  }

  // Quantitative limits from here on: resolve the result to a number.
  let number: number | null;
  if (resultQ) {
    // TNTC and friends are above any finite limit by definition.
    if (resultQ.exceeds_limit) return REMARKS.non_compliant;
    number = resultQ.numeric_equivalent ?? null;
  } else {
    number = toNumber(value);
  }
  if (number === null) return REMARKS.indeterminate;

  const range = RANGE_RE.exec(limit);
  if (range) {
    const low = parseFloat(range[1]);
    const high = parseFloat(range[2]);
    return number >= low && number <= high ? REMARKS.compliant : REMARKS.non_compliant;
  }

  const limitNumber = toNumber(limit);
  if (limitNumber === null) return REMARKS.indeterminate;
  return number <= limitNumber ? REMARKS.compliant : REMARKS.non_compliant;
}

// Contamination rating scale (lab work instruction, ASTM D5588), by colony count.
export const NO_CONTAMINATION = "No Contamination";
export const TRACE_CONTAMINATION = "Trace Contamination";
export const LIGHT_CONTAMINATION = "Light Contamination";
export const MODERATE_CONTAMINATION = "Moderate Contamination";
export const HEAVY_CONTAMINATION = "Heavy Contamination";

const rating = (label: string): Remark => ({ kind: "rating", label, advisory: null });

/** Rate a colony count: 0 none, 1–9 trace, 10–99 light, 100+ moderate, TNTC heavy. */
export function contaminationRating(
  resultValue: string | null | undefined,
  qualifiers: ResultQualifier[]
): Remark {
  const value = (resultValue ?? "").trim();
  if (!value) return REMARKS.not_tested;

  const resultQ = matchQualifier(value, qualifiers);
  let number: number | null;
  if (resultQ) {
    // TNTC — continuous growth, colonies indistinguishable.
    if (resultQ.exceeds_limit) return rating(HEAVY_CONTAMINATION);
    if (!resultQ.is_detected) return rating(NO_CONTAMINATION);
    number = resultQ.numeric_equivalent ?? null;
  } else {
    number = toNumber(value);
  }
  if (number === null) {
    return {
      kind: "indeterminate",
      label: "—",
      advisory: "Enter a colony count (or TNTC) so the contamination rating can be set.",
    };
  }

  if (number <= 0) return rating(NO_CONTAMINATION);
  if (number < 10) return rating(TRACE_CONTAMINATION);
  if (number < 100) return rating(LIGHT_CONTAMINATION);
  return rating(MODERATE_CONTAMINATION);
}

/** REMARKS column for a catalog test, following its remark rule. */
export function evaluateItemRemark(
  item: Pick<TestCatalogItem, "remark_rule" | "standard_limit">,
  resultValue: string | null | undefined,
  qualifiers: ResultQualifier[],
  manualRemark?: string | null
): Remark {
  if (item.remark_rule === "contamination_rating") return contaminationRating(resultValue, qualifiers);
  if (item.remark_rule === "manual") {
    if (!(resultValue ?? "").trim()) return REMARKS.not_tested;
    const text = (manualRemark ?? "").trim();
    if (text) return { kind: "manual", label: text, advisory: null };
    return { kind: "indeterminate", label: "—", advisory: "Enter the remark for this test." };
  }
  return evaluateRemark(item.standard_limit, resultValue, qualifiers);
}

/** Analyst-entered remark stored on a result, if any. */
export function storedRemark(result?: TestResult | null): string {
  const remarks = result?.raw_observations?.remarks;
  return typeof remarks === "string" ? remarks : "";
}

/** Legend rows for a report, in display order. */
export function legendEntries(
  qualifiers: ResultQualifier[],
  isWaste: boolean
): ResultQualifier[] {
  const wanted = isWaste ? "waste" : "non_waste";
  return qualifiers
    .filter(
      (q) => q.is_active && q.show_in_legend && (q.legend_scope === "all" || q.legend_scope === wanted)
    )
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.code.localeCompare(b.code));
}
