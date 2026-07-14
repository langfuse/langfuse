import { describe, expect, it } from "vitest";
import {
  HOME_DASHBOARD_PRESET_IDS,
  LANGFUSE_HOME_DASHBOARD,
  LANGFUSE_HOME_DASHBOARD_ID,
} from "./home-dashboard";
import { DashboardDomainSchema } from "../server/services/DashboardService/types";

describe("LANGFUSE_HOME_DASHBOARD", () => {
  it("parses through DashboardDomainSchema the way the worker upsert consumes it", () => {
    const parsed = DashboardDomainSchema.parse({
      ...LANGFUSE_HOME_DASHBOARD,
      createdAt: new Date(LANGFUSE_HOME_DASHBOARD.createdAt),
      updatedAt: new Date(LANGFUSE_HOME_DASHBOARD.updatedAt),
      projectId: null,
      createdBy: null,
      updatedBy: null,
      owner: "LANGFUSE",
    });

    expect(parsed.id).toBe(LANGFUSE_HOME_DASHBOARD_ID);
    expect(parsed.definition.widgets.length).toBeGreaterThan(0);
    expect(parsed.definition.widgets.every((w) => w.type === "preset")).toBe(
      true,
    );
  });

  it("places every registered preset exactly once", () => {
    const placedPresetIds = LANGFUSE_HOME_DASHBOARD.definition.widgets.flatMap(
      (w) => (w.type === "preset" ? [w.presetId] : []),
    );

    expect([...placedPresetIds].sort()).toEqual(
      [...HOME_DASHBOARD_PRESET_IDS].sort(),
    );
    // Placement ids must be unique within the dashboard (react keys,
    // scheduler ids, delete targets).
    const placementIds = LANGFUSE_HOME_DASHBOARD.definition.widgets.map(
      (w) => w.id,
    );
    expect(new Set(placementIds).size).toBe(placementIds.length);
  });

  it("fits the 12-column grid without overlapping tiles", () => {
    const tiles = LANGFUSE_HOME_DASHBOARD.definition.widgets;

    for (const tile of tiles) {
      expect(tile.x + tile.x_size).toBeLessThanOrEqual(12);
    }

    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        const a = tiles[i];
        const b = tiles[j];
        const overlaps =
          a.x < b.x + b.x_size &&
          b.x < a.x + a.x_size &&
          a.y < b.y + b.y_size &&
          b.y < a.y + a.y_size;
        expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });
});
