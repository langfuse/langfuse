import { chartConfigToWidgetInput } from "./chartConfigToWidget";
import { DEFAULT_CONFIG } from "../vocab";
import { type ChartViewConfig } from "../types";

const map = (config: Partial<ChartViewConfig>) =>
  chartConfigToWidgetInput({
    config: { ...DEFAULT_CONFIG, ...config },
    filters: [],
  });

describe("chartConfigToWidgetInput", () => {
  it("maps a count-by-model line chart to an observations widget", () => {
    const w = map({
      metric: "count",
      aggregation: "count",
      breakdown: "model",
      chartType: "LINE_TIME_SERIES",
    });
    expect(w.view).toBe("observations");
    expect(w.dimensions).toEqual([{ field: "providedModelName" }]);
    expect(w.metrics).toEqual([{ measure: "count", agg: "count" }]);
    expect(w.chartType).toBe("LINE_TIME_SERIES");
    expect(w.chartConfig).toEqual({ type: "LINE_TIME_SERIES" });
    expect(w.name).toBe("Count of events by model over time");
    // Always v2: the chart reads the v2 events path, so the widget must too.
    expect(w.minVersion).toBe(2);
  });

  it("maps a ranked cost-by-model chart with a row limit", () => {
    const w = map({
      metric: "totalCost",
      aggregation: "sum",
      breakdown: "model",
      chartType: "HORIZONTAL_BAR",
    });
    expect(w.metrics).toEqual([{ measure: "totalCost", agg: "sum" }]);
    expect(w.chartConfig).toEqual({ type: "HORIZONTAL_BAR", row_limit: 20 });
    expect(w.name).toBe("Sum cost by model");
  });

  it("drops the breakdown for a big number", () => {
    const w = map({
      metric: "count",
      aggregation: "count",
      breakdown: "model",
      chartType: "NUMBER",
    });
    expect(w.dimensions).toEqual([]);
    expect(w.chartConfig).toEqual({ type: "NUMBER" });
  });

  it("forwards the filters verbatim (the chart's safe subset)", () => {
    const filters = [
      {
        column: "type",
        type: "stringOptions" as const,
        operator: "any of" as const,
        value: ["GENERATION"],
      },
    ];
    const w = chartConfigToWidgetInput({ config: DEFAULT_CONFIG, filters });
    expect(w.filters).toEqual(filters);
  });
});
