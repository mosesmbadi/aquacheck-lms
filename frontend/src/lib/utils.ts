export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Extract a human-readable error message from an Axios error whose response
 * may contain FastAPI's `detail` field as either a plain string or an array
 * of Pydantic validation error objects.
 */
export function apiErrorMessage(err: unknown, fallback = "An unexpected error occurred."): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: { msg?: string; loc?: unknown[] }) => {
        const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : null;
        const prefix = field && field !== "body" ? `${field}: ` : "";
        return `${prefix}${d.msg ?? "Validation error"}`;
      })
      .join(" · ");
  }
  return fallback;
}
