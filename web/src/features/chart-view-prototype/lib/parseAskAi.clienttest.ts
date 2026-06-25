import { ASK_AI_SUGGESTIONS, parseAskAi } from "./parseAskAi";
import { getMetric } from "../vocab";

describe("parseAskAi", () => {
  it("maps p95 latency by model over time to a line time series", () => {
    expect(parseAskAi("p95 latency by model over time")).toEqual({
      metric: "latency",
      aggregation: "p95",
      breakdown: "model",
      chartType: "LINE_TIME_SERIES",
      timeGranularity: "hour",
    });
  });

  it("maps total cost by model to a ranked bar", () => {
    expect(parseAskAi("total cost by model")).toEqual({
      metric: "totalCost",
      aggregation: "sum",
      breakdown: "model",
      chartType: "HORIZONTAL_BAR",
      timeGranularity: "hour",
    });
  });

  it("maps request volume over time to a count line", () => {
    expect(parseAskAi("request volume over time")).toEqual({
      metric: "count",
      aggregation: "count",
      breakdown: "none",
      chartType: "LINE_TIME_SERIES",
      timeGranularity: "hour",
    });
  });

  it("maps errors over time by level to a level breakdown", () => {
    const config = parseAskAi("errors over time by level");
    expect(config.breakdown).toBe("level");
    expect(config.chartType).toBe("LINE_TIME_SERIES");
  });

  it("coerces an aggregation the metric does not support", () => {
    // Count only supports "count" — asking to average it must not produce an
    // invalid spec.
    const config = parseAskAi("average number of events by model");
    expect(getMetric(config.metric).aggregations).toContain(config.aggregation);
  });

  it("falls back to the default config for an empty query", () => {
    expect(parseAskAi("   ")).toEqual(parseAskAi(""));
  });

  it("produces a valid spec for every canned suggestion", () => {
    for (const suggestion of ASK_AI_SUGGESTIONS) {
      const config = parseAskAi(suggestion);
      expect(getMetric(config.metric).aggregations).toContain(
        config.aggregation,
      );
    }
  });
});
