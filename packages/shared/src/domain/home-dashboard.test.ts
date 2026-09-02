import { describe, expect, it } from "vitest";
import {
  HOME_DASHBOARD_PRESET_IDS,
  HOME_DASHBOARD_TOOL_WIDGET_IDS,
  LANGFUSE_HOME_DASHBOARD,
  LANGFUSE_HOME_DASHBOARD_ID,
} from "./home-dashboard";
import { DashboardDomainSchema } from "../server/services/DashboardService/types";

const HOME_TOOL_WIDGET_IDS = Object.values(HOME_DASHBOARD_TOOL_WIDGET_IDS);

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
    expect(parsed.name).toBe("Home");
    expect(parsed.definition.widgets.length).toBeGreaterThan(0);
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

  it("places the three tool widgets after the overview row", () => {
    const toolWidgets = LANGFUSE_HOME_DASHBOARD.definition.widgets.filter(
      (w) => w.type === "widget",
    );

    expect(toolWidgets.map((w) => w.widgetId).sort()).toEqual(
      [...HOME_TOOL_WIDGET_IDS].sort(),
    );
    expect(toolWidgets.every((w) => w.y === 5 && w.y_size === 5)).toBe(true);
    expect(
      toolWidgets.map((w) => ({
        widgetId: w.widgetId,
        x: w.x,
        x_size: w.x_size,
      })),
    ).toEqual([
      {
        widgetId: HOME_DASHBOARD_TOOL_WIDGET_IDS.totalToolCalls,
        x: 0,
        x_size: 3,
      },
      {
        widgetId: HOME_DASHBOARD_TOOL_WIDGET_IDS.top20CalledTools,
        x: 3,
        x_size: 5,
      },
      {
        widgetId: HOME_DASHBOARD_TOOL_WIDGET_IDS.p95ToolLatency,
        x: 8,
        x_size: 4,
      },
    ]);
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
