import { describe, expect, it } from "vitest";
import { RESOURCE_LIMIT_ERROR_MESSAGE } from "@langfuse/shared";
import { toWidgetChartDataPoint } from "./toWidgetChartDataPoint";
import { getWidgetChartQueryState } from "./getWidgetChartQueryState";

describe("widget chart data", () => {
  const base = {
    metricField: "count_count",
    aggregation: "count",
    timeDimension: "2026-01-01",
    isTimeSeries: true,
    dimensionLabelMap: undefined,
    normalizeHistogram: true,
  };

  it.each([null, ""])(
    "preserves empty %s dimension buckets",
    (dimensionValue) => {
      expect(
        toWidgetChartDataPoint({ ...base, dimensionValue, metricValue: 0 }),
      ).toEqual({
        time_dimension: base.timeDimension,
        dimension: undefined,
        metric: null,
      });
    },
  );

  it("keeps real zero averages and missing-value gaps", () => {
    const average = {
      ...base,
      aggregation: "avg",
      metricField: "avg_latency",
      dimensionValue: null,
    };
    expect(
      toWidgetChartDataPoint({ ...average, metricValue: 0 }),
    ).toMatchObject({ dimension: "n/a", metric: 0 });
    expect(
      toWidgetChartDataPoint({ ...average, metricValue: null }),
    ).toMatchObject({ dimension: undefined, metric: null });
    expect(
      toWidgetChartDataPoint({
        ...average,
        dimensionValue: "production",
        metricValue: null,
      }),
    ).toMatchObject({ dimension: "production", metric: null });
  });

  it.each([
    [null, "n/a"],
    ["", "n/a"],
    [["a", "b"], "a, b"],
    [42, "42"],
    [false, "false"],
  ])("formats categorical dimension %s", (dimensionValue, expected) => {
    expect(
      toWidgetChartDataPoint({
        ...base,
        isTimeSeries: false,
        dimensionValue,
        metricValue: "3",
      }),
    ).toMatchObject({ dimension: expected, metric: 3 });
  });

  it("maps known dimension labels and leaves unknown labels unchanged", () => {
    const dimensionLabelMap = new Map([["id", "Name"]]);
    expect(
      toWidgetChartDataPoint({
        ...base,
        dimensionLabelMap,
        dimensionValue: "id",
        metricValue: 1,
      }).dimension,
    ).toBe("Name");
    expect(
      toWidgetChartDataPoint({
        ...base,
        dimensionLabelMap,
        dimensionValue: "other",
        metricValue: 1,
      }).dimension,
    ).toBe("other");
  });

  it("normalizes histogram bins only when requested", () => {
    const metricValue = [
      ["1", "2"],
      ["3", "4"],
    ];
    const histogram = {
      ...base,
      isTimeSeries: false,
      dimensionValue: undefined,
      metricValue,
    };
    expect(toWidgetChartDataPoint(histogram).metric).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(
      toWidgetChartDataPoint({ ...histogram, normalizeHistogram: false })
        .metric,
    ).toBe(metricValue);
  });
});

describe("widget chart query state", () => {
  const pending = {
    isPending: true,
    isError: false,
    error: null,
    progress: null,
    usesBackendProgress: false,
  };

  it("uses a spinner for non-streaming queries", () => {
    expect(getWidgetChartQueryState(pending)).toMatchObject({
      chartLoadingState: {
        isLoading: true,
        showSpinner: true,
        showHintImmediately: false,
      },
      loadingProgress: { type: "spinner" },
    });
  });

  it("waits for backend progress before showing a fraction", () => {
    expect(
      getWidgetChartQueryState({ ...pending, usesBackendProgress: true })
        .loadingProgress,
    ).toEqual({ type: "indeterminate" });
    const progress = {
      percent: 0.5,
      read_rows: 5,
      total_rows_to_read: 10,
      elapsed_ns: 1000000,
      read_bytes: 100,
    };
    expect(
      getWidgetChartQueryState({
        ...pending,
        usesBackendProgress: true,
        progress,
      }).loadingProgress,
    ).toEqual({
      type: "determinate",
      fraction: 0.5,
      read_rows: 5,
      total_rows_to_read: 10,
    });
    expect(
      getWidgetChartQueryState({
        ...pending,
        isPending: false,
        usesBackendProgress: true,
        progress,
      }).loadingProgress,
    ).toEqual({ type: "spinner" });
  });

  it.each([null, "Query failed"])("shows immediate errors with %s", (error) => {
    expect(
      getWidgetChartQueryState({
        ...pending,
        isPending: false,
        isError: true,
        error,
      }).chartLoadingState,
    ).toEqual({
      isLoading: true,
      showSpinner: false,
      showHintImmediately: true,
      hintText: error ?? RESOURCE_LIMIT_ERROR_MESSAGE,
    });
  });

  it("clears loading and hints after success", () => {
    expect(
      getWidgetChartQueryState({ ...pending, isPending: false })
        .chartLoadingState,
    ).toEqual({
      isLoading: false,
      showSpinner: false,
      showHintImmediately: false,
      hintText: undefined,
    });
  });
});
