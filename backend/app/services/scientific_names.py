"""
Italicising scientific names on the printed test report.

The lab maintains the list (Scientific Names, under Result Qualifiers); the report
wraps every match in <i>…</i>. Applied to text that has already been XML-escaped, so
it is safe to feed straight into a ReportLab Paragraph.
"""
import re
from typing import Callable, Iterable

from sqlalchemy.orm import Session

from app.models.scientific_name import ScientificName

# Seeded once, into an empty table, so a term the lab deletes stays deleted.
DEFAULT_SCIENTIFIC_NAMES = [
    "E. coli",
    "Escherichia coli",
    "Pseudomonas aeruginosa",
    "Salmonella",
    "Streptococcus faecalis",
]


def seed_scientific_names(db: Session) -> int:
    if db.query(ScientificName.id).first():
        return 0
    for term in DEFAULT_SCIENTIFIC_NAMES:
        db.add(ScientificName(term=term))
    db.commit()
    return len(DEFAULT_SCIENTIFIC_NAMES)


def _term_pattern(term: str) -> str:
    """Regex for one term. A dot may or may not be followed by a space ("E.coli" ==
    "E. coli") and any run of whitespace matches any other."""
    out = []
    for part in re.split(r"(\.\s*|\s+)", term.strip()):
        if not part:
            continue
        if part.startswith("."):
            out.append(r"\.\s*")
        elif part.isspace():
            out.append(r"\s+")
        else:
            out.append(re.escape(part))
    return "".join(out)


def build_italicizer(terms: Iterable[str]) -> Callable[[str], str]:
    """A function that wraps each whole-word occurrence of any term in <i>…</i>.
    Longer terms win ("Escherichia coli" before "E. coli")."""
    patterns = sorted({_term_pattern(t) for t in terms if t and t.strip()}, key=len, reverse=True)
    if not patterns:
        return lambda text: text
    regex = re.compile(rf"(?<!\w)(?:{'|'.join(patterns)})(?!\w)", re.IGNORECASE)
    return lambda text: regex.sub(lambda m: f"<i>{m.group(0)}</i>", text)


def load_italicizer(db: Session) -> Callable[[str], str]:
    terms = [
        row[0]
        for row in db.query(ScientificName.term).filter(ScientificName.is_active == True).all()  # noqa: E712
    ]
    return build_italicizer(terms)
