import {
  buildChartQuery,
  metricField,
  rowsToDataPoints,
} from "./buildChartQuery";
import { DEFAULT_CONFIG } from "../vocab";
import { type ChartViewConfig } from "../types";

const FROM = new Date("2026-06-25T00:00:00.000Z");
const TO = new Date("2026-06-26T00:00:00.000Z");

const build = (config: Partial<ChartViewConfig>) =>
  buildChartQuery({
    config: { ...DEFAULT_CONFIG, ...config },
    filters: [],
    fromTimestamp: FROM,
    toTimestamp: TO,
  });

describe("buildChartQuery", () => {
  it("builds a time-series count-by-model query with auto granularity", () => {
    const q = build({
      metric: "count",
      aggregation: "count",
      breakdown: "model",
      chartType: "LINE_TIME_SERIES",
    });
    expect(q.view).toBe("observations");
    expect(q.dimensions).toEqual([{ field: "providedModelName" }]);
    expect(q.metrics).toEqual([{ measure: "count", aggregation: "count" }]);
    expect(q.timeDimension).toEqual({ granularity: "auto" });
    expect(q.orderBy).toBeNull();
    expect(q.fromTimestamp).toBe("2026-06-25T00:00:00.000Z");
  });

  it("always uses auto granularity, ignoring config.timeGranularity", () => {
    // Production has no granularity control — the chart (and any widget it
    // becomes) always renders auto buckets, so a stale config value is ignored.
    const daily = build({
      chartType: "LINE_TIME_SERIES",
      timeGranularity: "day",
    });
    expect(daily.timeDimension).toEqual({ granularity: "auto" });
  });

  it("builds a categorical query with top-N ordering and a row limit", () => {
    const q = build({
      metric: "totalCost",
      aggregation: "sum",
      breakdown: "model",
      chartType: "HORIZONTAL_BAR",
    });
    expect(q.timeDimension).toBeNull();
    expect(q.dimensions).toEqual([{ field: "providedModelName" }]);
    expect(q.orderBy).toEqual([{ field: "sum_totalCost", direction: "desc" }]);
    expect(q.chartConfig).toEqual({ type: "HORIZONTAL_BAR", row_limit: 20 });
  });

  it("drops the breakdown and time dimension for a big number", () => {
    const q = build({
      metric: "count",
      aggregation: "count",
      breakdown: "model",
      chartType: "NUMBER",
    });
    expect(q.dimensions).toEqual([]);
    expect(q.timeDimension).toBeNull();
    expect(q.orderBy).toBeNull();
  });

  it("omits dimensions for a no-breakdown time series", () => {
    const q = build({ breakdown: "none", chartType: "AREA_TIME_SERIES" });
    expect(q.dimensions).toEqual([]);
    expect(q.timeDimension).toEqual({ granularity: "auto" });
  });

  it("names the metric column as aggregation_measure", () => {
    expect(
      metricField({ ...DEFAULT_CONFIG, metric: "latency", aggregation: "p95" }),
    ).toBe("p95_latency");
    expect(
      metricField({ ...DEFAULT_CONFIG, metric: "count", aggregation: "count" }),
    ).toBe("count_count");
  });
});

describe("rowsToDataPoints", () => {
  it("maps time-series breakdown rows", () => {
    const rows = [
      {
        time_dimension: "2026-06-25T10:00:00Z",
        providedModelName: "gpt-4o",
        count_count: 5,
      },
      {
        time_dimension: "2026-06-25T10:00:00Z",
        providedModelName: "claude-opus-4",
        count_count: 3,
      },
    ];
    expect(
      rowsToDataPoints(rows, {
        ...DEFAULT_CONFIG,
        metric: "count",
        aggregation: "count",
        breakdown: "model",
        chartType: "LINE_TIME_SERIES",
      }),
    ).toEqual([
      {
        time_dimension: "2026-06-25T10:00:00Z",
        dimension: "gpt-4o",
        metric: 5,
      },
      {
        time_dimension: "2026-06-25T10:00:00Z",
        dimension: "claude-opus-4",
        metric: 3,
      },
    ]);
  });

  it("labels a no-breakdown series by the metric", () => {
    const rows = [{ time_dimension: "2026-06-25T10:00:00Z", count_count: 8 }];
    const [point] = rowsToDataPoints(rows, {
      ...DEFAULT_CONFIG,
      breakdown: "none",
      chartType: "LINE_TIME_SERIES",
    });
    expect(point.dimension).toBe("Count");
    expect(point.metric).toBe(8);
  });

  it("maps a categorical row and maps null/empty dimensions to n/a", () => {
    const config: ChartViewConfig = {
      ...DEFAULT_CONFIG,
      metric: "totalCost",
      aggregation: "sum",
      breakdown: "model",
      chartType: "HORIZONTAL_BAR",
    };
    const [nullPoint] = rowsToDataPoints(
      [{ providedModelName: null, sum_totalCost: 1.5 }],
      config,
    );
    expect(nullPoint.dimension).toBe("n/a");
    expect(nullPoint.metric).toBe(1.5);
    expect(nullPoint.time_dimension).toBeUndefined();

    const [emptyPoint] = rowsToDataPoints(
      [{ providedModelName: "", sum_totalCost: 2 }],
      config,
    );
    expect(emptyPoint.dimension).toBe("n/a");
  });

  it("produces a single dimensionless point for a big number", () => {
    const rows = [{ count_count: 42 }];
    expect(
      rowsToDataPoints(rows, {
        ...DEFAULT_CONFIG,
        chartType: "NUMBER",
      }),
    ).toEqual([
      { time_dimension: undefined, dimension: undefined, metric: 42 },
    ]);
  });
});
