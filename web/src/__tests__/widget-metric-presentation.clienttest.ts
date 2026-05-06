import { getWidgetMetricPresentation } from "@/src/features/widgets/utils";

describe("getWidgetMetricPresentation", () => {
  it("returns USD labeling for cost widgets", () => {
    const presentation = getWidgetMetricPresentation({
      metric: { measure: "totalCost", agg: "sum" },
      view: "observations",
      version: "v1",
    });

    expect(presentation.label).toBe("USD");
    expect(
      presentation.metricFormatter?.(1.234567, {
        style: "compact",
      }),
    ).toEqual({
      prefix: "$",
      main: "1.234567",
    });
    expect(
      presentation.metricFormatter?.(-1.234567, {
        style: "compact",
      }),
    ).toEqual({
      negative: true,
      prefix: "$",
      main: "1.234567",
    });
    expect(
      presentation.metricFormatter?.(-10.123456, {
        style: "compact",
      }),
    ).toEqual({
      negative: true,
      prefix: "$",
      main: "10.12",
    });
  });

  it("returns latency presentation for millisecond widgets", () => {
    const presentation = getWidgetMetricPresentation({
      metric: { measure: "latency", agg: "p95" },
      view: "traces",
      version: "v1",
    });

    expect(presentation.label).toBe("Duration");
    expect(
      presentation.metricFormatter?.(1500, {
        style: "compact",
      }),
    ).toEqual({
      main: "1.5",
      suffix: "s",
    });
    expect(
      presentation.metricFormatter?.(-1500, {
        style: "compact",
      }),
    ).toEqual({
      negative: true,
      main: "1.5",
      suffix: "s",
    });
  });

  it("returns unit labels for token widgets", () => {
    const presentation = getWidgetMetricPresentation({
      metric: { measure: "totalTokens", agg: "sum" },
      view: "observations",
      version: "v1",
    });

    expect(presentation.label).toBe("Tokens");
    expect(presentation.metricFormatter).toBeUndefined();
  });

  it("falls back to the default presentation for count aggregations", () => {
    const presentation = getWidgetMetricPresentation({
      metric: { measure: "latency", agg: "count" },
      view: "traces",
      version: "v1",
    });

    expect(presentation.label).toBe("Count Latency");
    expect(presentation.metricFormatter).toBeUndefined();
  });

  it("falls back to the default presentation for uniq aggregations", () => {
    const presentation = getWidgetMetricPresentation({
      metric: { measure: "totalCost", agg: "uniq" },
      view: "observations",
      version: "v1",
    });

    expect(presentation.label).toBe("Uniq Total Cost");
    expect(presentation.metricFormatter).toBeUndefined();
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
