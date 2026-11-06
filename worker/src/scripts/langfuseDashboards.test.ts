import { describe, expect, it } from "vitest";
import langfuseDashboards from "../constants/langfuse-dashboards.json";

describe("langfuse template dashboards", () => {
  it("places the combined usage total and time series without overlapping existing widgets", () => {
    const dashboard = langfuseDashboards.dashboards.find(
      (entry) => entry.name === "Langfuse Usage Management",
    );
    expect(dashboard).toBeDefined();
    const placements = dashboard!.definition.widgets;
    const widgets = placements.map((placement) => {
      const widget = langfuseDashboards.widgets.find(
        (entry) => entry.id === placement.widgetId,
      );
      expect(widget).toBeDefined();
      return widget!;
    });
    const billableWidgets = widgets.filter(
      (widget) => widget.view === "BILLABLE_UNITS",
    );
    expect(billableWidgets.map((widget) => widget.chartType).sort()).toEqual([
      "LINE_TIME_SERIES",
      "NUMBER",
    ]);
    for (const widget of billableWidgets) {
      expect(widget.metrics).toEqual([{ measure: "count", agg: "count" }]);
      expect(widget.dimensions).toEqual([]);
    }
    for (const [index, placement] of placements.entries()) {
      for (const other of placements.slice(index + 1)) {
        const overlaps =
          placement.x < other.x + other.x_size &&
          other.x < placement.x + placement.x_size &&
          placement.y < other.y + other.y_size &&
          other.y < placement.y + placement.y_size;
        expect(
          overlaps,
          `${placement.widgetId} overlaps ${other.widgetId}`,
        ).toBe(false);
      }
    }
  });

  it("ranks Top 20 Called Tools by per-tool invocations, not observation count", () => {
    const widget = langfuseDashboards.widgets.find(
      (entry) => entry.name === "Top 20 Called Tools",
    );

    expect(widget).toMatchObject({
      view: "OBSERVATIONS",
      dimensions: [{ field: "calledToolNames" }],
      metrics: [{ agg: "sum", measure: "toolCallInvocations" }],
    });
    expect(widget?.description).not.toMatch(/observations that called/i);
  });
});
