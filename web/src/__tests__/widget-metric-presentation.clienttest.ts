import { getWidgetMetricPresentation } from "@/src/features/widgets/utils";

describe("getWidgetMetricPresentation", () => {
  it("returns USD labeling for cost widgets", () => {
    const presentation = getWidgetMetricPresentation({
      metric: { measure: "totalCost", agg: "sum" },
      view: "observations",
      version: "v1",
    });

    expect(presentation.label).toBe("USD");
    expect(presentation.valueFormatter?.(1.234567)).toBe("$1.234567");
  });

  it("returns latency presentation for millisecond widgets", () => {
    const presentation = getWidgetMetricPresentation({
      metric: { measure: "latency", agg: "p95" },
      view: "traces",
      version: "v1",
    });

    expect(presentation.label).toBe("Seconds");
    expect(presentation.valueFormatter?.(1500)).toBe("1.50s");
  });

  it("returns unit labels for token widgets", () => {
    const presentation = getWidgetMetricPresentation({
      metric: { measure: "totalTokens", agg: "sum" },
      view: "observations",
      version: "v1",
    });

    expect(presentation.label).toBe("Tokens");
    expect(presentation.valueFormatter).toBeUndefined();
  });

  it("falls back to the default presentation for count aggregations", () => {
    const presentation = getWidgetMetricPresentation({
      metric: { measure: "latency", agg: "count" },
      view: "traces",
      version: "v1",
    });

    expect(presentation.label).toBe("Count Latency");
    expect(presentation.valueFormatter).toBeUndefined();
  });

  it("falls back to the default presentation for uniq aggregations", () => {
    const presentation = getWidgetMetricPresentation({
      metric: { measure: "totalCost", agg: "uniq" },
      view: "observations",
      version: "v1",
    });

    expect(presentation.label).toBe("Uniq Total Cost");
    expect(presentation.valueFormatter).toBeUndefined();
  });

  it("uses the default metric label for count_count", () => {
    const presentation = getWidgetMetricPresentation({
      metric: { measure: "count", agg: "count" },
      view: "traces",
      version: "v1",
    });

    expect(presentation.label).toBe("Count");
  });
});
