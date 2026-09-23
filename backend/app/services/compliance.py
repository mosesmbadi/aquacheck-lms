"""
Compliance evaluation for a test result against its standard limit.

The vocabulary this relies on (ND, TNTC, Detected, Nil…) lives in the
`result_qualifiers` table rather than in code, so the lab can teach the system a new
token without a release. Keep this module behaviourally identical to its frontend twin
in `frontend/src/lib/compliance.ts` — both render the REMARKS column.
"""
from dataclasses import dataclass
from enum import Enum
from typing import Iterable, List, Optional
import re

from app.models.result_qualifier import ResultQualifier, QualifierKind, LegendScope

COMPLIANT = "COMPLIANT"
NON_COMPLIANT = "NON-COMPLIANT"

# Standard-limit placeholders meaning "no set standard" — remarks stay blank (printed NS).
_NO_STANDARD = {"", "-", "—", "–", "n/a", "na", "ns", "none", "no set standard"}

_RANGE_RE = re.compile(r"^\s*([\d.]+)\s*[–\-]\s*([\d.]+)\s*$")
# Leading comparator and trailing unit are tolerated: "≤ 100", "< 0.5", "100 mg/L".
_NUMBER_RE = re.compile(r"-?\d+(?:\.\d+)?")


def _norm(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def _to_float(value: Optional[str]) -> Optional[float]:
    match = _NUMBER_RE.search(value or "")
    if not match:
        return None
    try:
        return float(match.group())
    except ValueError:
        return None


def match_qualifier(
    value: Optional[str], qualifiers: Iterable[ResultQualifier]
) -> Optional[ResultQualifier]:
    """Find the qualifier whose code or alias equals `value` (case-insensitive)."""
    needle = _norm(value)
    if not needle:
        return None
    for q in qualifiers:
        if q.kind != QualifierKind.qualifier or not q.is_active:
            continue
        if _norm(q.code) == needle:
            return q
        if any(_norm(alias) == needle for alias in (q.aliases or [])):
            return q
    return None


class RemarkKind(str, Enum):
    """
    Why the REMARKS column reads the way it does.

    These are deliberately distinct. "NS" on a test report is a factual claim — that no
    standard exists for the parameter. Printing it when a standard *does* exist but the
    result could not be evaluated would misrepresent the legend, so those cases are kept
    apart and shown differently.
    """

    compliant = "compliant"
    non_compliant = "non_compliant"
    #: No specification set for this parameter — nothing to comply with.
    no_standard = "no_standard"
    #: No result was entered. Never treated as a pass.
    not_tested = "not_tested"
    #: Above the measurable range with no standard to fail against (e.g. TNTC vs "—").
    out_of_range = "out_of_range"
    #: A standard exists but the result cannot be compared to it.
    indeterminate = "indeterminate"


@dataclass(frozen=True)
class Remark:
    kind: RemarkKind
    #: What the printed test report shows in the REMARKS column.
    label: str
    #: Advisory for the analyst. Never printed for the customer.
    advisory: Optional[str] = None


_REMARKS = {
    RemarkKind.compliant: Remark(RemarkKind.compliant, COMPLIANT),
    RemarkKind.non_compliant: Remark(RemarkKind.non_compliant, NON_COMPLIANT),
    RemarkKind.no_standard: Remark(RemarkKind.no_standard, "NS"),
    RemarkKind.not_tested: Remark(
        RemarkKind.not_tested,
        "Not tested",
        "No result entered — this parameter cannot be reported.",
    ),
    # Still NS: there is genuinely no standard here, so no conformity statement is possible.
    RemarkKind.out_of_range: Remark(
        RemarkKind.out_of_range,
        "NS",
        "Out of measurable range — repeat at a higher dilution before reporting.",
    ),
    RemarkKind.indeterminate: Remark(
        RemarkKind.indeterminate,
        "—",
        "Result cannot be evaluated against this specification — check the entry.",
    ),
}


def evaluate_remark(
    standard_limit: Optional[str],
    result_value: Optional[str],
    qualifiers: Iterable[ResultQualifier],
) -> Remark:
    """
    Evaluate one result against its standard limit.

    ISO/IEC 17025 §7.8.6: a statement of conformity requires a specification to state it
    against. Where none exists we report NS and stop — an out-of-range result does not
    become a failure just because it is large.
    """
    qualifiers = list(qualifiers)
    value = (result_value or "").strip()
    limit = (standard_limit or "").strip()

    if not value:
        return _REMARKS[RemarkKind.not_tested]

    result_q = match_qualifier(value, qualifiers)

    if _norm(limit) in _NO_STANDARD:
        # TNTC with nothing to fail against: NS for the customer, but the analyst is told.
        if result_q is not None and result_q.exceeds_limit:
            return _REMARKS[RemarkKind.out_of_range]
        return _REMARKS[RemarkKind.no_standard]

    limit_q = match_qualifier(limit, qualifiers)

    # Qualitative limit demanding absence ("Not Detectable", "Nil", "Absent").
    if limit_q is not None and not limit_q.is_detected:
        if result_q is not None:
            return _REMARKS[
                RemarkKind.non_compliant if result_q.is_detected else RemarkKind.compliant
            ]
        number = _to_float(value)
        if number is None:
            return _REMARKS[RemarkKind.indeterminate]
        return _REMARKS[RemarkKind.compliant if number == 0 else RemarkKind.non_compliant]

    # Quantitative limits from here on: resolve the result to a number.
    if result_q is not None:
        if result_q.exceeds_limit:
            # TNTC and friends are above any finite limit by definition.
            return _REMARKS[RemarkKind.non_compliant]
        number = result_q.numeric_equivalent
    else:
        number = _to_float(value)
    if number is None:
        return _REMARKS[RemarkKind.indeterminate]

    range_match = _RANGE_RE.match(limit)
    if range_match:
        low, high = float(range_match.group(1)), float(range_match.group(2))
        ok = low <= number <= high
        return _REMARKS[RemarkKind.compliant if ok else RemarkKind.non_compliant]

    limit_number = _to_float(limit)
    if limit_number is None:
        return _REMARKS[RemarkKind.indeterminate]
    ok = number <= limit_number
    return _REMARKS[RemarkKind.compliant if ok else RemarkKind.non_compliant]


def legend_entries(
    qualifiers: Iterable[ResultQualifier], is_waste: bool
) -> List[ResultQualifier]:
    """Legend rows for a report, in display order."""
    wanted = LegendScope.waste if is_waste else LegendScope.non_waste
    rows = [
        q
        for q in qualifiers
        if q.is_active
        and q.show_in_legend
        and q.legend_scope in (LegendScope.all, wanted)
    ]
    return sorted(rows, key=lambda q: (q.sort_order or 0, q.code))
