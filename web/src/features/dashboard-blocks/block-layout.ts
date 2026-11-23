import { type SavedDashboardBlock } from "@langfuse/shared";
import { type DashboardPlacement } from "@/src/features/widgets/components/DashboardGrid";

export type DashboardBlockSection = {
  key: string;
  blocks: SavedDashboardBlock[];
  widgets: DashboardPlacement[];
};

/** Groups vertically connected tiles so an inserted row cannot split a tall tile. */
export function prepareDashboardBlockSections(
  widgets: DashboardPlacement[],
  blocks: SavedDashboardBlock[],
): DashboardBlockSection[] {
  const rows: { widgets: DashboardPlacement[]; from: number; to: number }[] =
    [];
  for (const widget of [...widgets].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.at(-1);
    if (row && widget.y < row.to) {
      row.widgets.push(widget);
      row.to = Math.max(row.to, widget.y + widget.y_size);
    } else {
      rows.push({
        widgets: [widget],
        from: widget.y,
        to: widget.y + widget.y_size,
      });
    }
  }
  const rowByPlacement = new Map(
    rows.flatMap((row, index) =>
      row.widgets.map((widget) => [widget.id, index] as const),
    ),
  );
  const blocksByRow = new Map<number, SavedDashboardBlock[]>();
  for (const block of blocks) {
    const index =
      block.beforePlacementId !== null
        ? (rowByPlacement.get(block.beforePlacementId) ?? rows.length)
        : rows.length;
    blocksByRow.set(index, [...(blocksByRow.get(index) ?? []), block]);
  }
  const sections: DashboardBlockSection[] = [];
  for (const [index, row] of rows.entries()) {
    const anchored = blocksByRow.get(index) ?? [];
    const previous = sections.at(-1);
    if (previous && anchored.length === 0) {
      previous.widgets.push(...row.widgets);
    } else {
      sections.push({
        key: `row:${row.widgets[0].id}`,
        blocks: anchored,
        widgets: [...row.widgets],
      });
    }
  }
  const trailing = blocksByRow.get(rows.length) ?? [];
  if (trailing.length > 0)
    sections.push({ key: "trailing-blocks", blocks: trailing, widgets: [] });
  return sections.map((section) => {
    const top = Math.min(...section.widgets.map((widget) => widget.y));
    return {
      ...section,
      widgets: section.widgets.map((widget) => ({
        ...widget,
        y: widget.y - top,
      })),
    };
  });
}
