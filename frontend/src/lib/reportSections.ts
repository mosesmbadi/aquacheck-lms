import type { SampleCategory, TestCatalogItem } from "./types";

export interface ReportSection {
  title: string;
  items: TestCatalogItem[];
}

const PHYSIO = "Physio-Chemical Test";
const MICRO = "Microbiological Test";

function sectionTitle(item: TestCatalogItem, isPaint: boolean): string {
  const custom = item.section?.trim();
  if (custom) return custom;
  if (item.category === "physicochemical") return PHYSIO;
  // Paint reports head this section "Microbiology Test", as on the lab's paint report.
  return isPaint ? "Microbiology Test" : MICRO;
}

/**
 * Group tests into the sections the report prints: the category's section, or the
 * test's own section when it has one (e.g. "Susceptibility Test"). Category sections
 * come first (physio-chemical, then microbiological); custom sections follow in the
 * order their first test appears. Tests keep their order within a section.
 */
export function reportSections(
  items: TestCatalogItem[],
  sampleCategory?: SampleCategory | null
): ReportSection[] {
  const isPaint = sampleCategory === "paint";
  const sections = new Map<string, TestCatalogItem[]>([
    [PHYSIO, []],
    [MICRO, []],
    ["Microbiology Test", []],
  ]);
  for (const item of items) {
    const title = sectionTitle(item, isPaint);
    if (!sections.has(title)) sections.set(title, []);
    sections.get(title)!.push(item);
  }
  return [...sections.entries()]
    .filter(([, sectionItems]) => sectionItems.length > 0)
    .map(([title, sectionItems]) => ({ title, items: sectionItems }));
}
