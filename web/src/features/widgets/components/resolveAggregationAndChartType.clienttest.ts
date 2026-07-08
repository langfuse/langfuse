import { resolveAggregationAndChartType } from "./WidgetForm";

const allAggs = [
  "sum",
  "avg",
  "count",
  "max",
  "min",
  "p50",
  "p75",
  "p90",
  "p95",
  "p99",
  "histogram",
  "uniq",
] as const;

const restrictedAggs = ["count", "uniq"] as const;

describe("resolveAggregationAndChartType", () => {
  // --- Bug fix: count + histogram must not infinite-loop (LFE-9231) ---

  it("bails HISTOGRAM chart to NUMBER when measure is count", () => {
    const result = resolveAggregationAndChartType({
      chartType: "HISTOGRAM",
      measure: "count",
      currentAgg: "count",
      validAggs: [...allAggs],
    });
    // currentAgg is already "count" so only chartType changes
    expect(result).toEqual({ chartType: "NUMBER" });
  });

  it("bails HISTOGRAM chart to NUMBER when switching measure to count while histogram is active", () => {
    const result = resolveAggregationAndChartType({
      chartType: "HISTOGRAM",
      measure: "count",
      currentAgg: "histogram",
      validAggs: [...allAggs],
    });
    expect(result).toEqual({ chartType: "NUMBER", aggregation: "count" });
  });

  // --- Existing behavior that must be preserved ---

  it("forces histogram aggregation for HISTOGRAM chart with numeric measure", () => {
    const result = resolveAggregationAndChartType({
      chartType: "HISTOGRAM",
      measure: "latency",
      currentAgg: "sum",
      validAggs: [...allAggs],
    });
    expect(result).toEqual({ aggregation: "histogram" });
  });

  it("returns null when HISTOGRAM chart already has histogram aggregation on numeric measure", () => {
    const result = resolveAggregationAndChartType({
      chartType: "HISTOGRAM",
      measure: "latency",
      currentAgg: "histogram",
      validAggs: [...allAggs],
    });
    expect(result).toBeNull();
  });

  it("bails HISTOGRAM to NUMBER when measure type does not support histogram", () => {
    const result = resolveAggregationAndChartType({
      chartType: "HISTOGRAM",
      measure: "someStringMeasure",
      currentAgg: "count",
      validAggs: [...restrictedAggs],
    });
    // currentAgg is already "count" which matches validAggs[0], so only chartType changes
    expect(result).toEqual({ chartType: "NUMBER" });
  });

  it("reverts histogram aggregation when switching away from HISTOGRAM chart", () => {
    const result = resolveAggregationAndChartType({
      chartType: "LINE_TIME_SERIES",
      measure: "latency",
      currentAgg: "histogram",
      validAggs: [...allAggs],
    });
    expect(result).toEqual({ aggregation: "sum" });
  });

  it("reverts histogram aggregation to count when switching away from HISTOGRAM on count measure", () => {
    const result = resolveAggregationAndChartType({
      chartType: "LINE_TIME_SERIES",
      measure: "count",
      currentAgg: "histogram",
      validAggs: [...allAggs],
    });
    expect(result).toEqual({ aggregation: "count" });
  });

  it("forces count aggregation for count measure", () => {
    const result = resolveAggregationAndChartType({
      chartType: "LINE_TIME_SERIES",
      measure: "count",
      currentAgg: "sum",
      validAggs: [...allAggs],
    });
    expect(result).toEqual({ aggregation: "count" });
  });

  it("returns null when no changes needed", () => {
    const result = resolveAggregationAndChartType({
      chartType: "LINE_TIME_SERIES",
      measure: "latency",
      currentAgg: "avg",
      validAggs: [...allAggs],
    });
    expect(result).toBeNull();
  });

  it("falls back to first valid agg when current is not valid", () => {
    const result = resolveAggregationAndChartType({
      chartType: "LINE_TIME_SERIES",
      measure: "someStringMeasure",
      currentAgg: "sum",
      validAggs: [...restrictedAggs],
    });
    expect(result).toEqual({ aggregation: "count" });
  });

  // --- Exhaustive idempotency: output is always a fixed point ---

  const chartTypes = [
    "NUMBER",
    "LINE_TIME_SERIES",
    "BAR_TIME_SERIES",
    "HORIZONTAL_BAR",
    "VERTICAL_BAR",
    "HISTOGRAM",
    "PIE",
    "PIVOT_TABLE",
  ];
  const measures = ["count", "latency", "stringMeasure"];
  const aggsPerMeasure: Record<string, readonly string[]> = {
    count: allAggs,
    latency: allAggs,
    stringMeasure: restrictedAggs,
  };

  const cases = chartTypes.flatMap((chartType) =>
    measures.flatMap((measure) =>
      [...aggsPerMeasure[measure]].map((agg) => ({
        chartType,
        measure,
        agg,
        validAggs: [...aggsPerMeasure[measure]] as string[],
      })),
    ),
  );

  it.each(cases)(
    "idempotent: $chartType + $measure + $agg",
    ({ chartType, measure, agg, validAggs }) => {
      const first = resolveAggregationAndChartType({
        chartType,
        measure,
        currentAgg: agg,
        validAggs: validAggs as any,
      });

      // Apply the resolution (or keep original if null) and re-run
      const resolvedChart = first?.chartType ?? chartType;
      const resolvedAgg = first?.aggregation ?? agg;

      const second = resolveAggregationAndChartType({
        chartType: resolvedChart,
        measure,
        currentAgg: resolvedAgg,
        validAggs: validAggs as any,
      });

      expect(second).toBeNull();
    },
  );
});
