import { describe, expect, it } from "vitest";
import { type SavedDashboardBlock } from "@langfuse/shared";
import { type DashboardPlacement } from "@/src/features/widgets/components/DashboardGrid";
import { prepareDashboardBlockSections } from "./block-layout";

const block = (
  id: string,
  beforePlacementId: string | null,
): SavedDashboardBlock => ({
  id,
  kind: "markdown",
  config: { version: 1 as const, title: "Section", content: "Notes" },
  revision: 1,
  beforePlacementId,
});

describe("saved dashboard block placement", () => {
  it("keeps overlapping rows together, preserves stored geometry, and appends orphan anchors", () => {
    const widgets: DashboardPlacement[] = [
      {
        id: "a",
        widgetId: "wa",
        type: "widget",
        x: 0,
        y: 0,
        x_size: 6,
        y_size: 4,
      },
      {
        id: "b",
        widgetId: "wb",
        type: "widget",
        x: 6,
        y: 2,
        x_size: 6,
        y_size: 4,
      },
      {
        id: "c",
        widgetId: "wc",
        type: "widget",
        x: 0,
        y: 6,
        x_size: 6,
        y_size: 4,
      },
      {
        id: "d",
        widgetId: "wd",
        type: "widget",
        x: 0,
        y: 10,
        x_size: 6,
        y_size: 4,
      },
    ];
    const original = structuredClone(widgets);
    const sections = prepareDashboardBlockSections(widgets, [
      block("heading", "b"),
      block("note", "c"),
      block("orphan", "removed"),
    ]);
    expect(
      sections.map((section) => ({
        blocks: section.blocks.map((item) => item.id),
        widgets: section.widgets.map((item) => [item.id, item.y]),
      })),
    ).toEqual([
      {
        blocks: ["heading"],
        widgets: [
          ["a", 0],
          ["b", 2],
        ],
      },
      {
        blocks: ["note"],
        widgets: [
          ["c", 0],
          ["d", 4],
        ],
      },
      { blocks: ["orphan"], widgets: [] },
    ]);
    expect(widgets).toEqual(original);
  });

  it("renders blocks on dashboards without any legacy placements", () => {
    expect(prepareDashboardBlockSections([], [block("note", null)])).toEqual([
      { key: "trailing-blocks", blocks: [block("note", null)], widgets: [] },
    ]);
  });
});
