import { describe, expect, it } from "vitest";
import { type StudioResult } from "@langfuse/shared";
import { createStudioWidget } from "./catalog";
import {
  prepareStudioChart,
  prepareStudioData,
  applyStudioSeriesPresentation,
} from "./prepareStudioChart";
import { seriesColor } from "@/src/features/widgets/chart-library/seriesColors";
import { renderHook } from "@testing-library/react";
import { usePreparedWidgetChart } from "@/src/features/widgets/components/usePreparedWidgetChart";

describe("studio chart preparation", () => {
  it("distinguishes all-null bucket markers from measured zeros without changing raw Data", () => {
    const config = createStudioWidget();
    config.display = { chartType: "LINE_TIME_SERIES", timeSeries: true };
    config.queries[0]!.dimensions = [{ field: "providedModelName" }];
    config.queries[0]!.metrics = ["p50", "p90"].map((aggregation) => ({
      id: aggregation,
      measure: "latency",
      aggregation: aggregation as "p50" | "p90",
    }));
    const result: StudioResult = {
      status: "complete",
      series: config.queries[0]!.metrics.map((metric) => ({
        id: `a.${metric.id}:null`,
        queryId: "a",
        metricId: metric.id,
        label: "Unknown",
        dimensions: { providedModelName: null },
        unit: "milliseconds",
        aggregation: metric.aggregation,
      })),
      rows: config.queries[0]!.metrics.map((metric) => ({
        seriesId: `a.${metric.id}:null`,
        queryId: "a",
        metricId: metric.id,
        label: "Unknown",
        dimensions: { providedModelName: null },
        dimension: null,
        time: "2026-11-18T00:00:00Z",
        value: null,
      })),
      summaries: [],
      diagnostics: [],
      warnings: [],
    };
    const missing = prepareStudioChart(result, config);
    expect(missing.hasMeasuredValues).toBe(false);
    expect(missing.data.map((point) => point.metric)).toEqual([null, null]);
    const audit = prepareStudioData(result, config, {
      scope: "rows",
      reference: "all",
      pageIndex: 0,
      pageSize: 100,
    });
    expect(
      audit.table.rows.map(
        (row) => row.cells.find((cell) => cell.columnId === "value")?.value,
      ),
    ).toEqual(["null", "null"]);
    const zero = {
      ...result,
      rows: result.rows.map((row, index) => ({
        ...row,
        value: index === 0 ? 0 : null,
      })),
    };
    expect(prepareStudioChart(zero, config).hasMeasuredValues).toBe(true);
    config.display.hiddenSeriesIds = [zero.rows[0]!.seriesId];
    expect(prepareStudioChart(zero, config).hasMeasuredValues).toBe(false);
  });

  it("keeps series order and colors stable across shuffled results and visibility changes", () => {
    const config = createStudioWidget();
    config.display = { chartType: "LINE_TIME_SERIES", timeSeries: true };
    config.queries = ["z", "a"].map((id) => ({
      ...config.queries[0]!,
      id,
      metrics: ["p90", "p50"].map((metricId) => ({
        id: metricId,
        measure: "latency",
        aggregation: metricId as "p90" | "p50",
      })),
    }));
    const ids = ["z.p90:one", "z.p90:two", "z.p50:one", "a.p90:one"];
    const rows = ids.map((seriesId, index) => {
      const [reference, model] = seriesId.split(":");
      const [queryId, metricId] = reference!.split(".");
      return {
        seriesId,
        queryId: queryId!,
        metricId: metricId!,
        label: seriesId,
        dimensions: { model: model! },
        dimension: model!,
        time: "2026-11-17T00:00:00Z",
        value: index + 1,
      };
    });
    const response = (order: number[]): StudioResult => ({
      status: "complete",
      rows: order.map((index) => rows[index]!),
      series: order.map((index) => ({
        ...rows[index]!,
        id: rows[index]!.seriesId,
        unit: "milliseconds",
        aggregation: rows[index]!.metricId,
      })),
      summaries: [],
      diagnostics: [],
      warnings: [],
    });
    const first = prepareStudioChart(response([3, 1, 2, 0]), config);
    const reloaded = prepareStudioChart(response([2, 0, 3, 1]), config);
    expect(first.availableSeries.map((series) => series.id)).toEqual(ids);
    expect(reloaded.colors).toEqual(first.colors);
    expect(ids.map((id) => first.colors[id]?.color)).toEqual(
      ids.map((_, index) => seriesColor(index)),
    );
    config.display.hiddenSeriesIds = [ids[0]!];
    const hidden = prepareStudioChart(response([1, 3, 0, 2]), config);
    expect(hidden.visibleSeries.map((series) => series.id)).toEqual(
      ids.slice(1),
    );
    for (const id of ids.slice(1))
      expect(hidden.colors[id]).toEqual(first.colors[id]);
    for (const chartType of [
      "LINE_TIME_SERIES",
      "AREA_TIME_SERIES",
      "BAR_TIME_SERIES",
    ] as const) {
      const { result: chart, rerender } = renderHook(
        ({ prepared }) => {
          const chart = usePreparedWidgetChart({
            chartType,
            data: prepared.data,
            config: prepared.colors,
            active: true,
          });
          return applyStudioSeriesPresentation(chart.visualization, prepared);
        },
        { initialProps: { prepared: first } },
      );
      const seriesOf = () => {
        const visualization = chart.current;
        if (
          visualization.type !== "line" &&
          visualization.type !== "area" &&
          visualization.type !== "stacked-bar"
        )
          throw new Error("Expected a time-series visualization");
        return visualization.series;
      };
      const original = seriesOf();
      expect(original.map((series) => series.id)).toEqual(ids);
      rerender({ prepared: reloaded });
      expect(seriesOf()).toEqual(original);
      rerender({ prepared: hidden });
      expect(seriesOf()).toEqual(original.slice(1));
    }
  });

  it("keeps histogram populations and breakdowns identifiable in equal bins", () => {
    const config = createStudioWidget();
    config.display.chartType = "HISTOGRAM";
    config.queries = ["a", "b"].map((id) => ({
      ...config.queries[0]!,
      id,
      label: id === "a" ? "Production" : "Staging",
      view: "scores-numeric",
      metrics: [{ id: "scores", measure: "value", aggregation: "histogram" }],
      dimensions: [{ field: "name" }],
    }));
    const populations = [
      { queryId: "a", label: "Production · Accuracy", name: "Accuracy" },
      { queryId: "a", label: "Production · Relevance", name: "Relevance" },
      { queryId: "b", label: "Staging · Accuracy", name: "Accuracy" },
    ];
    const result: StudioResult = {
      status: "complete",
      series: populations.map((population) => ({
        id: `${population.queryId}.scores:${population.name}`,
        queryId: population.queryId,
        metricId: "scores",
        label: population.label,
        dimensions: { name: population.name },
        unit: "scores",
        aggregation: "histogram",
      })),
      rows: populations.flatMap((population, index) =>
        ["[0, 0.5)", "No value"].map((dimension) => ({
          seriesId: `${population.queryId}.scores:${population.name}`,
          queryId: population.queryId,
          metricId: "scores",
          label: population.label,
          dimensions: { bin: dimension },
          dimension,
          time: null,
          value: index + 1,
        })),
      ),
      summaries: [],
      diagnostics: [],
      warnings: [],
    };
    const prepared = prepareStudioChart(result, config);
    expect(prepared.data.map((point) => point.dimension)).toEqual([
      "Production · Accuracy · [0, 0.5)",
      "Production · Accuracy · No value",
      "Production · Relevance · [0, 0.5)",
      "Production · Relevance · No value",
      "Staging · Accuracy · [0, 0.5)",
      "Staging · Accuracy · No value",
    ]);
    expect(prepared.data.map((point) => point.metric)).toEqual([
      1, 1, 2, 2, 3, 3,
    ]);
  });
  it("keeps equal display names independent and retains full-period summaries for a breakdown", () => {
    const config = createStudioWidget();
    config.display.chartType = "LINE_TIME_SERIES";
    config.display.timeSeries = true;
    config.queries = ["a", "b"].map((id) => ({
      ...config.queries[0]!,
      id,
      label: "Population",
      dimensions: [{ field: "name" }],
    }));
    const rows = ["a", "b"].map((queryId, index) => ({
      seriesId: `${queryId}.count:model`,
      label: "Population · model",
      queryId,
      metricId: "count",
      time: "2026-11-17T00:00:00Z",
      dimensions: { name: "model" },
      dimension: "model",
      value: index + 1,
    }));
    const result: StudioResult = {
      status: "complete",
      rows,
      series: rows.map((row) => ({
        id: row.seriesId,
        label: row.label,
        queryId: row.queryId,
        metricId: row.metricId,
        dimensions: row.dimensions,
        aggregation: "count",
      })),
      summaries: rows.map((row) => ({
        ...row,
        seriesId: `${row.queryId}.count`,
        time: null,
        dimensions: {},
        dimension: null,
        value: 100,
      })),
      diagnostics: [],
      warnings: [],
    };
    const prepared = prepareStudioChart(result, config);
    expect(prepared.data.map((point) => point.dimension)).toEqual([
      "a.count:model",
      "b.count:model",
    ]);
    expect(Object.keys(prepared.colors)).toHaveLength(2);
    expect(prepared.summaries).toHaveLength(2);
    expect(prepared.pivotTable.type).toBe("table");
    if (prepared.pivotTable.type !== "table") throw new Error("Expected table");
    expect(prepared.pivotTable.rows).toHaveLength(1);
    expect(prepared.pivotTable.rows[0]?.cells.slice(-2)).toEqual([
      { columnId: "a.count", value: "1" },
      { columnId: "b.count", value: "2" },
    ]);
  });
  it("keeps raw units visible when a display override combines cost and tokens", () => {
    const config = createStudioWidget();
    config.display.unit = "percent";
    config.queries = [
      {
        ...config.queries[0]!,
        id: "cost",
        label: "Cost",
        metrics: [{ id: "value", measure: "totalCost", aggregation: "sum" }],
      },
      {
        ...config.queries[0]!,
        id: "usage",
        label: "Tokens",
        metrics: [{ id: "value", measure: "totalTokens", aggregation: "sum" }],
      },
    ];
    const rows = config.queries.map((query, index) => ({
      seriesId: `${query.id}.value`,
      queryId: query.id,
      metricId: "value",
      label: query.label,
      time: null,
      dimensions: {},
      dimension: null,
      value: index === 0 ? 1 : 1200,
    }));
    const result: StudioResult = {
      status: "complete",
      rows,
      summaries: [],
      diagnostics: [],
      warnings: [],
      series: rows.map((row, index) => ({
        id: row.seriesId,
        queryId: row.queryId,
        metricId: row.metricId,
        label: row.label,
        dimensions: {},
        unit: index === 0 ? "USD" : "tokens",
        aggregation: "sum",
      })),
    };
    const prepared = prepareStudioChart(result, config);
    expect(prepared.hasIncompatibleUnits).toBe(true);
    expect(prepared.unit).toBeUndefined();
    if (prepared.table.type !== "table") throw new Error("Expected table");
    expect(
      prepared.table.rows.map(
        (row) => row.cells.find((cell) => cell.columnId === "value")?.value,
      ),
    ).toEqual(["$1.00", "1.2K"]);
  });
  it("audits hidden inputs exactly without changing chart visibility or inheriting the chart row limit", () => {
    const config = createStudioWidget();
    config.queries = ["a", "b"].map((id) => ({
      ...config.queries[0]!,
      id,
      label: id,
      hidden: true,
    }));
    config.expressions = [
      {
        id: "twice",
        label: "Intermediate",
        formula: "b.count * 2",
        hidden: true,
      },
      {
        id: "rate",
        label: "Rate",
        formula: "twice / a.count",
        unit: "percent",
      },
    ];
    config.display = {
      chartType: "LINE_TIME_SERIES",
      timeSeries: true,
      rowLimit: 1,
      showHeadline: true,
    };
    const refs = [
      {
        queryId: "a",
        metricId: "count",
        label: "a",
        value: 1000000,
        unit: "observations",
        aggregation: "count",
      },
      {
        queryId: "b",
        metricId: "count",
        label: "b",
        value: 3,
        unit: "observations",
        aggregation: "count",
      },
      {
        queryId: "twice",
        metricId: "twice",
        label: "Intermediate",
        value: 6,
        unit: "observations",
        aggregation: "expression",
      },
      {
        queryId: "rate",
        metricId: "rate",
        label: "Rate",
        value: 0.000006,
        unit: "percent",
        rawUnit: "ratio",
        aggregation: "expression",
      },
    ];
    const rows = refs.flatMap((ref) =>
      ["2026-11-16T00:00:00Z", "2026-11-17T00:00:00Z"].map((time) => ({
        ...ref,
        seriesId: `${ref.queryId}.${ref.metricId}`,
        time,
        dimensions: {},
        dimension: null,
      })),
    );
    const result: StudioResult = {
      status: "complete",
      rows,
      summaries: rows
        .filter((row) => row.time.includes("16T"))
        .map((row) => ({ ...row, time: null })),
      series: refs.map((ref) => ({
        ...ref,
        id: `${ref.queryId}.${ref.metricId}`,
        dimensions: {},
      })),
      diagnostics: [],
      warnings: [],
    };
    const chart = prepareStudioChart(result, config);
    expect(chart.visibleSeries.map((series) => series.queryId)).toEqual([
      "rate",
    ]);
    expect(chart.summaries.map((row) => row.queryId)).toEqual(["rate"]);
    const inputs = prepareStudioData(result, config, {
      scope: "rows",
      reference: "a.count",
      pageIndex: 0,
      pageSize: 100,
    });
    expect(inputs.rowCount).toBe(2);
    expect(inputs.table.rows).toHaveLength(2);
    expect(
      inputs.table.rows[0]?.cells.find((cell) => cell.columnId === "value")
        ?.value,
    ).toBe(1000000);
    expect(
      inputs.table.rows[0]?.cells.find((cell) => cell.columnId === "unit")
        ?.value,
    ).toBe("observations");
    expect(inputs.referenceOptions.map((option) => option.value)).toEqual([
      "all",
      "a.count",
      "b.count",
      "twice",
      "rate",
    ]);
    const summary = prepareStudioData(result, config, {
      scope: "summaries",
      reference: "rate",
      pageIndex: 0,
      pageSize: 100,
    });
    expect(
      summary.table.rows[0]?.cells.find((cell) => cell.columnId === "value")
        ?.value,
    ).toBe(0.000006);
    expect(
      summary.table.rows[0]?.cells.find((cell) => cell.columnId === "unit")
        ?.value,
    ).toBe("ratio");
    const page = prepareStudioData(result, config, {
      scope: "rows",
      reference: "all",
      pageIndex: 1,
      pageSize: 2,
    });
    expect(page.rowCount).toBe(8);
    expect(page.table.rows).toHaveLength(2);
  });
  it("preserves available series when every saved result is hidden and suppresses an unfiltered headline for a partial selection", () => {
    const config = createStudioWidget();
    config.queries[0]!.dimensions = [{ field: "name" }];
    config.display.showHeadline = true;
    const rows = ["one", "two"].map((name) => ({
      seriesId: `a.count:${name}`,
      label: name,
      queryId: "a",
      metricId: "count",
      time: null,
      dimensions: { name },
      dimension: name,
      value: 10,
    }));
    const result: StudioResult = {
      status: "complete",
      rows,
      series: rows.map((row) => ({
        id: row.seriesId,
        label: row.label,
        queryId: row.queryId,
        metricId: row.metricId,
        dimensions: row.dimensions,
        aggregation: "count",
        unit: "observations",
      })),
      summaries: [
        {
          ...rows[0]!,
          seriesId: "a.count",
          dimensions: {},
          dimension: null,
          value: 20,
        },
      ],
      warnings: [],
      diagnostics: [],
    };
    config.display.hiddenSeriesIds = [rows[0]!.seriesId];
    const partial = prepareStudioChart(result, config);
    expect(partial.availableSeries).toHaveLength(2);
    expect(partial.visibleSeries.map((series) => series.id)).toEqual([
      rows[1]!.seriesId,
    ]);
    expect(partial.summaries).toEqual([]);
    expect(partial.headlineSuppressed).toBe(true);
    config.display.hiddenSeriesIds = rows.map((row) => row.seriesId);
    const none = prepareStudioChart(result, config);
    expect(none.availableSeries).toHaveLength(2);
    expect(none.visibleSeries).toHaveLength(0);
    expect(none.data).toHaveLength(0);
  });
  it("formats chart durations like latency tables while Data preserves raw milliseconds", () => {
    const config = createStudioWidget();
    config.queries[0]!.metrics = [
      { id: "latency", measure: "latency", aggregation: "p50" },
    ];
    const row = {
      seriesId: "a.latency",
      queryId: "a",
      metricId: "latency",
      label: "Latency",
      time: null,
      dimensions: {},
      dimension: null,
      value: 64000,
    };
    const result: StudioResult = {
      status: "complete",
      rows: [row],
      summaries: [],
      series: [
        {
          id: row.seriesId,
          queryId: "a",
          metricId: "latency",
          label: row.label,
          dimensions: {},
          aggregation: "p50",
          unit: "milliseconds",
        },
      ],
      diagnostics: [],
      warnings: [],
    };
    const chart = prepareStudioChart(result, config);
    if (chart.table.type !== "table") throw new Error("Expected table");
    expect(
      chart.table.rows[0]?.cells.find((cell) => cell.columnId === "value")
        ?.value,
    ).toBe("1m 04s");
    const audit = prepareStudioData(result, config, {
      scope: "rows",
      reference: "all",
      pageIndex: 0,
      pageSize: 50,
    });
    expect(
      audit.table.rows[0]?.cells.find((cell) => cell.columnId === "value")
        ?.value,
    ).toBe(64000);
    expect(
      audit.table.rows[0]?.cells.find((cell) => cell.columnId === "unit")
        ?.value,
    ).toBe("milliseconds");
  });
  it("does not infer a single headline from two logical metrics after one summary is suppressed", () => {
    const config = createStudioWidget();
    config.queries[0]!.metrics = ["p50", "p90"].map((id) => ({
      id,
      measure: "latency",
      aggregation: id as "p50" | "p90",
    }));
    config.display.showHeadline = true;
    config.display.chartType = "LINE_TIME_SERIES";
    config.display.timeSeries = true;
    const rows = ["p50", "p90"].flatMap((metricId) =>
      ["one", "two"].map((name) => ({
        seriesId: `a.${metricId}:${name}`,
        label: `${name} ${metricId}`,
        queryId: "a",
        metricId,
        time: "2026-11-17",
        dimensions: { name },
        dimension: name,
        value: metricId === "p50" ? 2250 : 3900,
      })),
    );
    const result: StudioResult = {
      status: "complete",
      rows,
      series: rows.map((row) => ({
        id: row.seriesId,
        label: row.label,
        queryId: row.queryId,
        metricId: row.metricId,
        dimensions: row.dimensions,
        aggregation: row.metricId,
        unit: "milliseconds",
      })),
      summaries: ["p50", "p90"].map((metricId) => ({
        ...rows.find((row) => row.metricId === metricId)!,
        seriesId: `a.${metricId}`,
        time: null,
        dimensions: {},
        dimension: null,
      })),
      diagnostics: [],
      warnings: [],
    };
    config.display.hiddenSeriesIds = ["a.p90:two"];
    const partial = prepareStudioChart(result, config);
    expect(partial.visibleSeries).toHaveLength(3);
    expect(partial.data.map((point) => point.metric)).toEqual([
      2250, 2250, 3900,
    ]);
    expect(partial.summaries).toHaveLength(1);
    expect(partial.headline).toBeUndefined();
    expect(partial.headlineSuppressed).toBe(false);
    config.display.headlineMetricRef = "a.p50";
    expect(prepareStudioChart(result, config).headline?.value).toBe(2250);
    config.display.headlineMetricRef = "a.p90";
    expect(prepareStudioChart(result, config).headline).toBeUndefined();
    expect(prepareStudioChart(result, config).headlineSuppressed).toBe(true);
  });
  it("uses live labels and formula presentation units over cached canonical query results", () => {
    const config = createStudioWidget();
    config.queries[0]!.label = "Traffic";
    config.expressions = [
      {
        id: "rate",
        label: "Success rate",
        formula: "a.count / a.count",
        unit: "percent",
      },
    ];
    const rows = [
      {
        seriesId: "a.count",
        queryId: "a",
        metricId: "count",
        label: "a",
        value: 2,
        time: null,
        dimension: null,
        dimensions: {},
      },
      {
        seriesId: "rate",
        queryId: "rate",
        metricId: "rate",
        label: "rate",
        value: 0.5,
        time: null,
        dimension: null,
        dimensions: {},
      },
    ];
    const result: StudioResult = {
      status: "complete",
      rows,
      summaries: rows,
      series: rows.map((row) => ({
        id: row.seriesId,
        queryId: row.queryId,
        metricId: row.metricId,
        label: row.label,
        dimensions: {},
        aggregation: row.queryId === "rate" ? "expression" : "count",
        unit: row.queryId === "rate" ? "ratio" : "observations",
        rawUnit: row.queryId === "rate" ? "ratio" : "observations",
      })),
      diagnostics: [],
      warnings: [],
    };
    const prepared = prepareStudioChart(result, config);
    expect(prepared.colors["a.count"]?.label).toBe("Traffic");
    expect(prepared.colors.rate?.label).toBe("Success rate");
    expect(
      prepared.visibleSeries.find((series) => series.id === "rate")?.unit,
    ).toBe("percent");
    expect(prepared.summaries.map((row) => row.label)).toEqual([
      "Traffic",
      "Success rate",
    ]);
    const audit = prepareStudioData(result, config, {
      scope: "rows",
      reference: "rate",
      pageIndex: 0,
      pageSize: 50,
    });
    expect(
      audit.table.rows[0]?.cells.find((cell) => cell.columnId === "series")
        ?.value,
    ).toBe("Success rate");
    expect(
      audit.table.rows[0]?.cells.find((cell) => cell.columnId === "value")
        ?.value,
    ).toBe(0.5);
    expect(
      audit.table.rows[0]?.cells.find((cell) => cell.columnId === "unit")
        ?.value,
    ).toBe("ratio");
  });
});
