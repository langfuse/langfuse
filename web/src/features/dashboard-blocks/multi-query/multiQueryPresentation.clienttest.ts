import { renderHook } from "@testing-library/react";
import { usePreparedWidgetChart } from "@/src/features/widgets/components/usePreparedWidgetChart";
import { prepareMultiQueryTimeSeriesData } from "./multiQueryTimeSeries";
import { describe, expect, it } from "vitest";
import {
  createMultiQueryTab,
  type MultiQuerySeries,
  type MultiQueryValue,
} from "./multiQueryModel";
import {
  multiQueryFormatter,
  prepareMultiQueryUnitVisualization,
} from "./multiQueryPresentation";
import { toFullMetricString } from "@/src/features/widgets/chart-library/utils";
import { groupedMetricTable, returnedRowsSubtotal } from "./multiQueryTable";

it("keeps ranked models and their metric columns together, including unattributed costs in the subtotal", () => {
  const example: MultiQueryValue = {
    queryId: "costs",
    queryLabel: "Models",
    metricId: "usd",
    metricLabel: "Cost",
    dimensions: { providedModelName: "Beta" },
    time: null,
    value: 8,
    unit: "USD",
    seriesId: "costs.usd",
  };
  const values = [
    example,
    {
      ...example,
      metricId: "tokens",
      metricLabel: "Tokens",
      value: 13,
      unit: "tokens",
    },
    { ...example, dimensions: { providedModelName: null }, value: 5 },
    { ...example, dimensions: { providedModelName: "Alpha" }, value: 0 },
  ];
  const config = createMultiQueryTab();
  config.queries[0] = {
    ...config.queries[0]!,
    id: "costs",
    metrics: [{ id: "usd", measure: "totalCost", aggregation: "sum" }],
  };
  const table = groupedMetricTable(values, true)!;
  expect(table.columns.map((c) => c.label)).toEqual([
    "Model",
    "Cost",
    "Tokens",
  ]);
  expect(table.rows.map((r) => r.cells[0]!.value)).toEqual(["Beta", "Alpha"]);
  expect(table.rows[1]!.cells[2]!.value).toBe("—");
  expect(returnedRowsSubtotal(config.queries, "costs.usd", values)?.value).toBe(
    13,
  );
  config.queries[0].metrics[0]!.aggregation = "p95";
  expect(
    returnedRowsSubtotal(config.queries, "costs.usd", values),
  ).toBeUndefined();
});

it("renders calculated percentage points once, including a measured zero", () => {
  const format = multiQueryFormatter("percent");
  expect(toFullMetricString(format(12.5, { style: "full" }))).toBe("12.5%");
  expect(toFullMetricString(format(0, { style: "compact" }))).toBe("0%");
});

it("shows zero for an absent filtered count only if all its groups were returned", () => {
  const common = {
    metricId: "count",
    metricLabel: "Count",
    unit: "integer",
    time: null,
    value: 1,
  };
  const rows = [
    {
      ...common,
      seriesId: "all.count",
      queryId: "all",
      queryLabel: "All",
      dimensions: { name: "A" },
    },
    {
      ...common,
      seriesId: "zero.count",
      queryId: "zero",
      queryLabel: "Zero",
      dimensions: { name: "B" },
    },
  ];
  const queries = ["all", "zero"].map((id) => ({
    ...createMultiQueryTab().queries[0]!,
    id,
    dimensions: [{ field: "name" }],
  }));
  const cell = (rowLimit: number) =>
    groupedMetricTable(rows, false, { queries, rowLimit })!.rows[0]!.cells.find(
      (c) => c.columnId === "zero.count",
    )!.value;
  expect(cell(10)).toBe(0);
  expect(cell(1)).toBe("—");
});

describe("multi-query value presentation", () => {
  it("shows an empty score mean as no measured value while keeping a genuine zero", () => {
    const config = createMultiQueryTab();
    config.display.chartType = "NUMBER";
    const series: MultiQuerySeries = {
      id: "a.score",
      label: "Quality",
      unit: undefined,
      aggregation: "avg",
      color: "blue",
      fillColor: "lightblue",
    };
    const row: MultiQueryValue = {
      seriesId: series.id,
      queryId: "a",
      metricId: "score",
      queryLabel: "Quality",
      metricLabel: "Average value",
      time: null,
      dimensions: {},
      unit: undefined,
      value: null,
      evaluationCount: 0,
    };
    const noValue = prepareMultiQueryUnitVisualization(
      config,
      [series],
      [row],
      { visualization: { type: "empty" } },
    );
    expect(noValue.type).toBe("empty");
    const actualZero = prepareMultiQueryUnitVisualization(
      config,
      [series],
      [{ ...row, value: 0, evaluationCount: 1 }],
      { visualization: { type: "empty" } },
    );
    expect(actualZero).toMatchObject({ type: "number", value: 0 });
  });
});

it("shows the empty population when a comparison contains only zero record counts", () => {
  const config = createMultiQueryTab();
  const series = {
    id: "a.count",
    label: "A",
    aggregation: "count",
    unit: "integer",
    color: "blue",
    fillColor: "blue",
  };
  const row = {
    seriesId: series.id,
    queryId: "a",
    metricId: "count",
    queryLabel: "A",
    metricLabel: "Count",
    time: null,
    dimensions: {},
    value: 0,
    unit: "integer",
  };
  const view = prepareMultiQueryUnitVisualization(config, [series], [row], {
    visualization: { type: "empty" },
  });
  expect(view).toMatchObject({ type: "empty", message: "0 matching records" });
});

it.each(["bar", "horizontal-bar"] as const)(
  "keeps a value from each independent query when the %s chart requests one row per series",
  (type) => {
    const config = createMultiQueryTab();
    config.display.rowLimit = 1;
    const series = ["Support", "Search"].map((label) => ({
      id: label,
      label,
      unit: "integer",
      aggregation: "count",
      color: "blue",
      fillColor: "blue",
    }));
    const rows = series.map((item, index) => ({
      seriesId: item.id,
      queryId: item.id,
      queryLabel: item.label,
      metricId: "count",
      metricLabel: "Count",
      value: index + 1,
      time: null,
      dimensions: {},
      unit: item.unit,
    }));
    const view = prepareMultiQueryUnitVisualization(config, series, rows, {
      visualization: { type, data: [], color: "blue", valueFormatter: String },
    });
    expect(view).toMatchObject({
      type,
      data:
        type === "bar"
          ? [
              { label: "Support", value: 1 },
              { label: "Search", value: 2 },
            ]
          : [
              { label: "Search", value: 2 },
              { label: "Support", value: 1 },
            ],
    });
  },
);

describe("grouped time-series missing cells", () => {
  it.each(["LINE_TIME_SERIES", "AREA_TIME_SERIES", "BAR_TIME_SERIES"] as const)(
    "%s fills only absent additive cells while retaining measured nulls and gaps",
    (chartType) => {
      const series: MultiQuerySeries[] = ["count", "uniq", "sum", "avg"].map(
        (aggregation) => ({
          id: aggregation,
          label: aggregation,
          aggregation,
          unit: undefined,
          color: "blue",
          fillColor: "blue",
        }),
      );
      const times = [
        "2026-11-01T00:00:00Z",
        "2026-11-02T00:00:00Z",
        "2026-11-03T00:00:00Z",
      ];
      const row = (
        seriesId: string,
        time: string,
        value: number | null,
      ): MultiQueryValue => ({
        seriesId,
        queryId: "a",
        metricId: seriesId,
        queryLabel: "A",
        metricLabel: seriesId,
        dimensions: { model: "one" },
        time,
        value,
        unit: undefined,
      });
      const values = [
        row("count", times[0]!, null),
        row("uniq", times[0]!, 2),
        row("sum", times[0]!, 0),
        row("avg", times[0]!, 0),
        row("count", times[2]!, 5),
        row("uniq", times[2]!, 1),
        row("sum", times[2]!, 4),
        row("avg", times[2]!, null),
      ];
      const { result } = renderHook(() =>
        usePreparedWidgetChart({
          chartType,
          active: true,
          ...prepareMultiQueryTimeSeriesData(series, values, times),
        }),
      );
      const chart = result.current.visualization;
      if (
        chart.type !== "line" &&
        chart.type !== "area" &&
        chart.type !== "stacked-bar"
      )
        throw new Error("Expected a time chart");
      expect(chart.data[1]?.values).toEqual({
        count: 0,
        uniq: 0,
        sum: 0,
        avg: null,
      });
      expect(chart.data[0]?.values).toEqual({
        count: null,
        uniq: 2,
        sum: 0,
        avg: 0,
      });
      expect(chart.data[2]?.values).toEqual({
        count: 5,
        uniq: 1,
        sum: 4,
        avg: null,
      });
      expect(values).toHaveLength(8);
    },
  );
});
