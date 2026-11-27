// @vitest-environment node

import {
  coerceScoreChartConfig,
  describeScoreChartConfig,
  getScoreChartTimeRange,
  scoreChartConfigToWidgetInput,
  scoreMetricField,
  scoreRowsToDataPoints,
} from "@/src/features/scores-chart-view/fns/scoreChartConfig";
import { DEFAULT_SCORE_CHART_CONFIG } from "@/src/features/scores-chart-view/constants/defaultScoreChartConfig";
import { type ScoreChartViewConfig } from "@/src/features/scores-chart-view/types";

describe("coerceScoreChartConfig", () => {
  it("resets the aggregation when the metric does not support it", () => {
    const coerced = coerceScoreChartConfig({
      ...DEFAULT_SCORE_CHART_CONFIG,
      metric: "count",
      aggregation: "avg", // count only supports "count"
    });
    expect(coerced.aggregation).toBe("count");
  });

  it("keeps a valid aggregation untouched", () => {
    const coerced = coerceScoreChartConfig({
      ...DEFAULT_SCORE_CHART_CONFIG,
      metric: "value",
      aggregation: "avg",
    });
    expect(coerced.aggregation).toBe("avg");
  });

  it("offers the full aggregation set for value, matching the dashboard widget builder", () => {
    // Regression: `value` used to be pinned to "avg" only, unlike the real
    // widget builder, which offers every aggregation for a number-typed
    // measure (`getValidAggregationsForMeasureType`).
    const coerced = coerceScoreChartConfig({
      ...DEFAULT_SCORE_CHART_CONFIG,
      metric: "value",
      aggregation: "max",
    });
    expect(coerced.aggregation).toBe("max");
  });

  it("preserves the boolean dataset (regression: a stale two-way check used to clamp it back to numeric)", () => {
    const coerced = coerceScoreChartConfig({
      ...DEFAULT_SCORE_CHART_CONFIG,
      dataset: "boolean",
    });
    expect(coerced.dataset).toBe("boolean");
  });

  it("picks the boolean dataset's own metrics, not the numeric dataset's", () => {
    const coerced = coerceScoreChartConfig({
      ...DEFAULT_SCORE_CHART_CONFIG,
      dataset: "boolean",
      metric: "value",
      aggregation: "avg",
    });
    expect(coerced.dataset).toBe("boolean");
    expect(coerced.metric).toBe("value");
    expect(coerced.aggregation).toBe("avg");
  });

  it("clamps unknown fields (untrusted URL params) to safe defaults", () => {
    const coerced = coerceScoreChartConfig({
      dataset: "bogus" as ScoreChartViewConfig["dataset"],
      metric: "bogus" as ScoreChartViewConfig["metric"],
      aggregation: "nope" as ScoreChartViewConfig["aggregation"],
      breakdown: "whoops" as ScoreChartViewConfig["breakdown"],
      chartType: "FOO" as ScoreChartViewConfig["chartType"],
      timeGranularity: "century" as ScoreChartViewConfig["timeGranularity"],
    });
    expect(coerced.dataset).toBe("numeric");
    expect(coerced.metric).toBe("count");
    expect(coerced.aggregation).toBe("count");
    expect(coerced.breakdown).toBe("none");
    expect(coerced.chartType).toBe("LINE_TIME_SERIES");
    expect(coerced.timeGranularity).toBe("hour");
  });
});

describe("describeScoreChartConfig", () => {
  it("describes a count time series with a breakdown", () => {
    expect(
      describeScoreChartConfig({
        ...DEFAULT_SCORE_CHART_CONFIG,
        metric: "count",
        breakdown: "name",
        chartType: "LINE_TIME_SERIES",
      }),
    ).toBe("Count of scores by name over time");
  });

  it("includes the aggregation for the value metric", () => {
    expect(
      describeScoreChartConfig({
        ...DEFAULT_SCORE_CHART_CONFIG,
        metric: "value",
        aggregation: "avg",
        breakdown: "name",
        chartType: "HORIZONTAL_BAR",
      }),
    ).toBe("Average value by name");
  });

  it("omits the breakdown for a big number (it shows a single total)", () => {
    expect(
      describeScoreChartConfig({
        ...DEFAULT_SCORE_CHART_CONFIG,
        metric: "count",
        breakdown: "name",
        chartType: "NUMBER",
      }),
    ).toBe("Count of scores");
  });
});

describe("scoreMetricField", () => {
  it("names the metric column as aggregation_measure", () => {
    expect(
      scoreMetricField({
        ...DEFAULT_SCORE_CHART_CONFIG,
        metric: "value",
        aggregation: "avg",
      }),
    ).toBe("avg_value");
    expect(
      scoreMetricField({
        ...DEFAULT_SCORE_CHART_CONFIG,
        metric: "count",
        aggregation: "count",
      }),
    ).toBe("count_count");
  });
});

describe("scoreRowsToDataPoints", () => {
  it("maps time-series breakdown rows", () => {
    const rows = [
      {
        time_dimension: "2026-06-25T10:00:00Z",
        name: "accuracy",
        count_count: 5,
      },
      {
        time_dimension: "2026-06-25T10:00:00Z",
        name: "toxicity",
        count_count: 3,
      },
    ];
    expect(
      scoreRowsToDataPoints(rows, {
        ...DEFAULT_SCORE_CHART_CONFIG,
        metric: "count",
        aggregation: "count",
        breakdown: "name",
        chartType: "LINE_TIME_SERIES",
      }),
    ).toEqual([
      {
        time_dimension: "2026-06-25T10:00:00Z",
        dimension: "accuracy",
        metric: 5,
      },
      {
        time_dimension: "2026-06-25T10:00:00Z",
        dimension: "toxicity",
        metric: 3,
      },
    ]);
  });

  it("labels a no-breakdown series by the metric", () => {
    const rows = [{ time_dimension: "2026-06-25T10:00:00Z", count_count: 8 }];
    const [point] = scoreRowsToDataPoints(rows, {
      ...DEFAULT_SCORE_CHART_CONFIG,
      breakdown: "none",
      chartType: "LINE_TIME_SERIES",
    });
    expect(point.dimension).toBe("Count");
    expect(point.metric).toBe(8);
  });

  it("maps a categorical row and maps null/empty dimensions to n/a", () => {
    const config: ScoreChartViewConfig = {
      ...DEFAULT_SCORE_CHART_CONFIG,
      metric: "value",
      aggregation: "avg",
      breakdown: "source",
      chartType: "HORIZONTAL_BAR",
    };
    const [nullPoint] = scoreRowsToDataPoints(
      [{ source: null, avg_value: 0.5 }],
      config,
    );
    expect(nullPoint.dimension).toBe("n/a");
    expect(nullPoint.metric).toBe(0.5);

    const [emptyPoint] = scoreRowsToDataPoints(
      [{ source: "", avg_value: 0.8 }],
      config,
    );
    expect(emptyPoint.dimension).toBe("n/a");
  });

  it("produces a single dimensionless point for a big number", () => {
    const rows = [{ count_count: 42 }];
    expect(
      scoreRowsToDataPoints(rows, {
        ...DEFAULT_SCORE_CHART_CONFIG,
        chartType: "NUMBER",
      }),
    ).toEqual([
      { time_dimension: undefined, dimension: undefined, metric: 42 },
    ]);
  });

  it("preserves an explicit null as a gap on a time series (never coerces to 0)", () => {
    const config: ScoreChartViewConfig = {
      ...DEFAULT_SCORE_CHART_CONFIG,
      metric: "value",
      aggregation: "avg",
      breakdown: "none",
      chartType: "LINE_TIME_SERIES",
    };
    const [point] = scoreRowsToDataPoints(
      [{ time_dimension: "2026-06-25T10:00:00Z", avg_value: null }],
      config,
    );
    expect(point.metric).toBeNull();
  });
});

describe("scoreChartConfigToWidgetInput", () => {
  const build = (config: Partial<ScoreChartViewConfig>) =>
    scoreChartConfigToWidgetInput({
      config: { ...DEFAULT_SCORE_CHART_CONFIG, ...config },
      filters: [],
    });

  it("maps the numeric dataset to the scores-numeric view", () => {
    expect(build({}).view).toBe("scores-numeric");
  });

  // Regression: `scores-numeric`'s own segment allow-lists NUMERIC AND
  // BOOLEAN, so leaving the numeric dataset unscoped mixed boolean 0/1
  // values into it once "boolean" became a separately selectable dataset.
  it("scopes the numeric dataset to NUMERIC only, excluding boolean scores", () => {
    expect(build({}).filters).toEqual([
      { column: "dataType", operator: "=", value: "NUMERIC", type: "string" },
    ]);
  });

  it("adds a redundant BOOLEAN-only filter for the boolean dataset (the view is already BOOLEAN-only)", () => {
    expect(build({ dataset: "boolean", metric: "value" }).filters).toEqual([
      { column: "dataType", operator: "=", value: "BOOLEAN", type: "string" },
    ]);
  });

  // The table's own Data Type filter is appended to, never replaced by, the
  // dataset's own scoping filter: if the two conflict (e.g. the sidebar set
  // to NUMERIC while viewing the boolean chart), they AND to zero rows and
  // the chart shows "No data" instead of silently overriding the user's
  // filter to show unrelated (boolean) data.
  it("ANDs a conflicting incoming dataType filter with the boolean dataset's own scope, yielding no data rather than overriding the filter", () => {
    const input = scoreChartConfigToWidgetInput({
      config: {
        ...DEFAULT_SCORE_CHART_CONFIG,
        dataset: "boolean",
        metric: "value",
      },
      filters: [
        { column: "dataType", operator: "=", value: "NUMERIC", type: "string" },
      ],
    });
    expect(input.filters).toEqual([
      { column: "dataType", operator: "=", value: "NUMERIC", type: "string" },
      { column: "dataType", operator: "=", value: "BOOLEAN", type: "string" },
    ]);
  });

  it("ANDs a conflicting incoming dataType filter with the categorical dataset's own scope, yielding no data rather than overriding the filter", () => {
    const input = scoreChartConfigToWidgetInput({
      config: { ...DEFAULT_SCORE_CHART_CONFIG, dataset: "categorical" },
      filters: [
        {
          column: "dataType",
          operator: "=",
          value: "BOOLEAN",
          type: "string",
        },
      ],
    });
    expect(input.filters).toEqual([
      { column: "dataType", operator: "=", value: "BOOLEAN", type: "string" },
      {
        column: "dataType",
        operator: "=",
        value: "CATEGORICAL",
        type: "string",
      },
    ]);
  });

  // Regression: a stale two-way check (`dataset === "categorical" ? ... :
  // "scores-numeric"`) used to fall the boolean dataset through to
  // scores-numeric, so "Add to dashboard" would save a widget querying the
  // wrong view.
  it("maps the boolean dataset to the scores-boolean view", () => {
    expect(build({ dataset: "boolean", metric: "value" }).view).toBe(
      "scores-boolean",
    );
  });

  it("maps the categorical dataset to the scores-categorical view, with its own redundant CATEGORICAL-only filter", () => {
    const input = build({ dataset: "categorical" });
    expect(input.view).toBe("scores-categorical");
    expect(input.filters).toEqual([
      {
        column: "dataType",
        operator: "=",
        value: "CATEGORICAL",
        type: "string",
      },
    ]);
  });

  // Regression: `scopeFiltersToDataset` used to replace an existing dataType
  // filter for the numeric dataset instead of ANDing it, so a table filtered
  // to BOOLEAN while viewing the numeric chart silently showed numeric data
  // instead of the "no data" a genuinely conflicting filter should produce.
  it("ANDs a conflicting incoming dataType filter with the numeric dataset's own scope, yielding no data rather than overriding the filter", () => {
    const input = scoreChartConfigToWidgetInput({
      config: { ...DEFAULT_SCORE_CHART_CONFIG, dataset: "numeric" },
      filters: [
        { column: "dataType", operator: "=", value: "BOOLEAN", type: "string" },
      ],
    });
    expect(input.filters).toEqual([
      { column: "dataType", operator: "=", value: "BOOLEAN", type: "string" },
      { column: "dataType", operator: "=", value: "NUMERIC", type: "string" },
    ]);
  });
});

describe("getScoreChartTimeRange", () => {
  const now = new Date("2026-06-26T12:00:00.000Z");

  it("does not invent a 24-hour range when the table is unfiltered", () => {
    expect(getScoreChartTimeRange(undefined, now)).toBeUndefined();
  });

  it("closes an open-ended table range at now", () => {
    expect(
      getScoreChartTimeRange(
        { from: new Date("2026-06-25T12:00:00.000Z") },
        now,
      ),
    ).toEqual({
      from: new Date("2026-06-25T12:00:00.000Z"),
      to: now,
    });
  });
});
