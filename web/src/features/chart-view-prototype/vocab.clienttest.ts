import { coerceConfig, describeConfig, DEFAULT_CONFIG } from "./vocab";

describe("coerceConfig", () => {
  it("resets the aggregation when the metric does not support it", () => {
    const coerced = coerceConfig({
      ...DEFAULT_CONFIG,
      metric: "count",
      aggregation: "p95", // count only supports "count"
    });
    expect(coerced.aggregation).toBe("count");
  });

  it("keeps a valid aggregation untouched", () => {
    const coerced = coerceConfig({
      ...DEFAULT_CONFIG,
      metric: "latency",
      aggregation: "p99",
    });
    expect(coerced.aggregation).toBe("p99");
  });
});

describe("describeConfig", () => {
  it("describes a count time series with a breakdown", () => {
    expect(
      describeConfig({
        ...DEFAULT_CONFIG,
        metric: "count",
        breakdown: "model",
        chartType: "LINE_TIME_SERIES",
      }),
    ).toBe("Count of events by model over time");
  });

  it("includes the aggregation for numeric metrics", () => {
    expect(
      describeConfig({
        ...DEFAULT_CONFIG,
        metric: "latency",
        aggregation: "p95",
        breakdown: "model",
        chartType: "HORIZONTAL_BAR",
      }),
    ).toBe("p95 latency by model");
  });

  it("omits the breakdown for a big number (it shows a single total)", () => {
    expect(
      describeConfig({
        ...DEFAULT_CONFIG,
        metric: "count",
        breakdown: "model",
        chartType: "NUMBER",
      }),
    ).toBe("Count of events");
  });
});
