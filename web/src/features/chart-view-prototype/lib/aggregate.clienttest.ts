import { aggregateEvents, floorToGranularity } from "./aggregate";
import { type PrototypeEvent } from "../types";
import { DEFAULT_CONFIG } from "../vocab";

const evt = (overrides: Partial<PrototypeEvent>): PrototypeEvent => ({
  id: "evt",
  startTime: "2026-06-25T10:15:30.000Z",
  type: "GENERATION",
  name: "generate-answer",
  model: "gpt-4o",
  level: "DEFAULT",
  environment: "production",
  latencyMs: 1000,
  totalCost: 0.01,
  totalTokens: 500,
  ...overrides,
});

describe("aggregateEvents", () => {
  it("returns no data points for an empty event set", () => {
    expect(aggregateEvents([], DEFAULT_CONFIG)).toEqual([]);
  });

  it("counts rows per time bucket and breakdown series", () => {
    const events = [
      evt({ startTime: "2026-06-25T10:05:00.000Z", model: "gpt-4o" }),
      evt({ startTime: "2026-06-25T10:45:00.000Z", model: "gpt-4o" }),
      evt({ startTime: "2026-06-25T11:10:00.000Z", model: "claude-opus-4" }),
    ];
    const data = aggregateEvents(events, {
      ...DEFAULT_CONFIG,
      metric: "count",
      aggregation: "count",
      breakdown: "model",
      chartType: "LINE_TIME_SERIES",
      timeGranularity: "hour",
    });
    // gpt-4o has 2 events in the 10:00 bucket, claude-opus-4 has 1 at 11:00.
    expect(data).toEqual([
      {
        time_dimension: "2026-06-25T10:00:00.000Z",
        dimension: "gpt-4o",
        metric: 2,
      },
      {
        time_dimension: "2026-06-25T11:00:00.000Z",
        dimension: "claude-opus-4",
        metric: 1,
      },
    ]);
  });

  it("emits time buckets in chronological order regardless of input order", () => {
    const events = [
      evt({ startTime: "2026-06-25T12:00:00.000Z" }),
      evt({ startTime: "2026-06-25T09:00:00.000Z" }),
      evt({ startTime: "2026-06-25T10:00:00.000Z" }),
    ];
    const data = aggregateEvents(events, {
      ...DEFAULT_CONFIG,
      breakdown: "none",
      timeGranularity: "hour",
    });
    expect(data.map((d) => d.time_dimension)).toEqual([
      "2026-06-25T09:00:00.000Z",
      "2026-06-25T10:00:00.000Z",
      "2026-06-25T12:00:00.000Z",
    ]);
  });

  it("averages a numeric metric within a group", () => {
    const events = [
      evt({ latencyMs: 100 }),
      evt({ latencyMs: 300 }),
      evt({ latencyMs: 200 }),
    ];
    const [point] = aggregateEvents(events, {
      ...DEFAULT_CONFIG,
      metric: "latency",
      aggregation: "avg",
      breakdown: "none",
      chartType: "NUMBER",
    });
    expect(point.metric).toBe(200);
  });

  it("computes interpolated percentiles", () => {
    const events = Array.from({ length: 100 }, (_, i) =>
      evt({ latencyMs: i + 1 }),
    ); // 1..100
    const [p95] = aggregateEvents(events, {
      ...DEFAULT_CONFIG,
      metric: "latency",
      aggregation: "p95",
      breakdown: "none",
      chartType: "NUMBER",
    });
    // linear interpolation over [1..100]: rank = 0.95 * 99 = 94.05 -> ~95.05
    expect(p95.metric as number).toBeCloseTo(95.05, 2);
  });

  it("ranks categorical results descending by metric", () => {
    const events = [
      evt({ model: "gpt-4o" }),
      evt({ model: "claude-opus-4" }),
      evt({ model: "claude-opus-4" }),
      evt({ model: "claude-opus-4" }),
      evt({ model: "gpt-4o" }),
    ];
    const data = aggregateEvents(events, {
      ...DEFAULT_CONFIG,
      metric: "count",
      aggregation: "count",
      breakdown: "model",
      chartType: "HORIZONTAL_BAR",
    });
    expect(data).toEqual([
      { time_dimension: undefined, dimension: "claude-opus-4", metric: 3 },
      { time_dimension: undefined, dimension: "gpt-4o", metric: 2 },
    ]);
  });

  it("produces a single aggregate for a big number", () => {
    const events = [evt({}), evt({}), evt({})];
    const data = aggregateEvents(events, {
      ...DEFAULT_CONFIG,
      metric: "count",
      aggregation: "count",
      breakdown: "model",
      chartType: "NUMBER",
    });
    expect(data).toEqual([
      { time_dimension: undefined, dimension: undefined, metric: 3 },
    ]);
  });
});

describe("floorToGranularity", () => {
  it("floors to the hour", () => {
    expect(floorToGranularity("2026-06-25T10:45:12.345Z", "hour")).toBe(
      "2026-06-25T10:00:00.000Z",
    );
  });
  it("floors to the day", () => {
    expect(floorToGranularity("2026-06-25T10:45:12.345Z", "day")).toBe(
      "2026-06-25T00:00:00.000Z",
    );
  });
  it("floors to the minute", () => {
    expect(floorToGranularity("2026-06-25T10:45:12.345Z", "minute")).toBe(
      "2026-06-25T10:45:00.000Z",
    );
  });
});
