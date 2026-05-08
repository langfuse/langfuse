import { getWidgetMetricPresentation } from "@/src/features/widgets/utils";

describe("getWidgetMetricPresentation", () => {
  it.each([
    {
      name: "cost widgets",
      metric: { measure: "totalCost", agg: "sum" },
      view: "observations",
      label: "USD",
      sampleValue: 1.234567,
      formatted: { prefix: "$" },
    },
    {
      name: "millisecond widgets",
      metric: { measure: "latency", agg: "p95" },
      view: "traces",
      label: "Duration",
      sampleValue: 1500,
      formatted: { suffix: "s" },
    },
  ] as const)(
    "returns $label labeling and unit formatting for $name",
    ({ metric, view, label, sampleValue, formatted }) => {
      const presentation = getWidgetMetricPresentation({
        metric,
        view,
        version: "v1",
      });

      expect(presentation.label).toBe(label);
      expect(presentation.metricFormatter).toBeDefined();
      expect(
        presentation.metricFormatter?.(sampleValue, {
          style: "compact",
        }),
      ).toMatchObject(formatted);
    },
  );

  it("returns unit labels without custom formatting for non-special units", () => {
    const presentation = getWidgetMetricPresentation({
      metric: { measure: "totalTokens", agg: "sum" },
      view: "observations",
      version: "v1",
    });

    expect(presentation.label).toBe("Tokens");
    expect(presentation.metricFormatter).toBeUndefined();
  });

  it.each([
    {
      metric: { measure: "latency", agg: "count" },
      view: "traces",
      label: "Count Latency",
    },
    {
      metric: { measure: "totalCost", agg: "uniq" },
      view: "observations",
      label: "Uniq Total Cost",
    },
    {
      metric: { measure: "count", agg: "count" },
      view: "traces",
      label: "Count",
    },
  ] as const)(
    "falls back to the default presentation for $metric.agg aggregations",
    ({ metric, view, label }) => {
      const presentation = getWidgetMetricPresentation({
        metric,
        view,
        version: "v1",
      });

      expect(presentation.label).toBe(label);
      expect(presentation.metricFormatter).toBeUndefined();
    },
  );
});
