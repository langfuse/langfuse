import type { DashboardDefinition } from "@langfuse/shared";

export type ReportPlacement = DashboardDefinition["widgets"][number];
export type ReportQuery = Extract<ReportPlacement, { type: "query" }>;
export type ReportNote = Extract<ReportPlacement, { type: "text" }>;
export type ReportPreset = Extract<ReportPlacement, { type: "preset" }>;

export type ReportSection = {
  id: string;
  title: string;
  heading?: ReportNote;
  introduction: string;
  cells: ReportPlacement[];
};

export function reportSections(
  definition: DashboardDefinition,
): ReportSection[] {
  const sections: ReportSection[] = [];
  const ordered = definition.widgets.toSorted((a, b) => a.y - b.y || a.x - b.x);
  let section: ReportSection = {
    id: "overview",
    title: "Overview",
    introduction: "",
    cells: [],
  };
  for (const cell of ordered) {
    const heading =
      cell.type === "text" && /^# ([^\n]+)(?:\n|$)/.exec(cell.content);
    if (cell.type === "text" && heading) {
      if (section.heading || section.cells.length) sections.push(section);
      section = {
        id: cell.id,
        title: heading[1].trim(),
        introduction: cell.content.slice(heading[0].length).trim(),
        heading: cell,
        cells: [],
      };
    } else {
      section.cells.push(cell);
    }
  }
  return [...sections, section];
}

/** Insert at the end of the current chapter and keep the grid and notebook in the same order. */
export function insertReportCell(
  definition: DashboardDefinition,
  sectionId: string,
  cell: ReportNote | ReportQuery,
): DashboardDefinition {
  const sections = reportSections(definition);
  const index = sections.findIndex((section) => section.id === sectionId);
  if (index === -1)
    throw new Error(
      "This section has changed. Reopen the report to add a cell.",
    );
  const next = sections[index + 1]?.heading;
  const y =
    next?.y ??
    definition.widgets.reduce(
      (bottom, item) => Math.max(bottom, item.y + item.y_size),
      0,
    );
  return {
    ...definition,
    widgets: [
      ...definition.widgets.map((item) =>
        item.y >= y ? { ...item, y: item.y + cell.y_size } : item,
      ),
      { ...cell, y },
    ],
  };
}
