import { expect, it } from "vitest";
import { type SavedDashboardBlock } from "@langfuse/shared";
import { createDashboardBlockPlacementUpdate } from "./dashboard-block-placement-update";

it("moves only a valid saved snapshot while preserving its config and revision", () => {
  const block: SavedDashboardBlock = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    kind: "multiQuery",
    revision: 7,
    beforePlacementId: "old-row",
    config: {
      version: 1,
      title: "Requests",
      description: "",
      queries: [
        {
          id: "a",
          label: "All requests",
          view: "observations",
          metrics: [{ id: "count", measure: "count", aggregation: "count" }],
          dimensions: [],
          filters: [],
        },
      ],
      display: { chartType: "VERTICAL_BAR" },
    },
  };
  const payload = createDashboardBlockPlacementUpdate(block, "next-row");
  expect(payload).toEqual({
    op: "upsert",
    id: block.id,
    kind: block.kind,
    config: block.config,
    expectedRevision: 7,
    beforePlacementId: "next-row",
  });
  expect(payload?.config).toBe(block.config);
  expect(block.beforePlacementId).toBe("old-row");
  expect(
    createDashboardBlockPlacementUpdate(
      { ...block, config: { ...block.config, queries: [] } },
      "next-row",
    ),
  ).toBeNull();
});
