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
  it("requires one logical metric for a big number even when only one of two metrics returned a summary", () => {
    const config = createStudioWidget();
    config.display = { chartType: "NUMBER", showHeadline: true };
    config.queries[0]!.metrics = [
      { id: "cost", measure: "totalCost", aggregation: "sum" },
      { id: "input", measure: "inputCost", aggregation: "sum" },
    ];
    const rows = config.queries[0]!.metrics.map((metric) => ({
      seriesId: `a.${metric.id}`,
      queryId: "a",
      metricId: metric.id,
      label: metric.id,
      dimensions: {},
      dimension: null,
      time: null,
      value: 4,
    }));
    const result: StudioResult = {
      status: "complete",
      rows,
      summaries: [rows[0]!],
      diagnostics: [],
      warnings: [],
      series: rows.map((row) => ({
        id: row.seriesId,
        queryId: row.queryId,
        metricId: row.metricId,
        label: row.label,
        dimensions: {},
        unit: "USD",
        aggregation: "sum",
      })),
    };
    expect(prepareStudioChart(result, config).chartRequirement?.type).toBe(
      "empty",
    );
    config.display.hiddenSeriesIds = ["a.input"];
    expect(prepareStudioChart(result, config).chartRequirement).toBeUndefined();
  });
  it.each(["VERTICAL_BAR", "HORIZONTAL_BAR"] as const)(
    "keeps an added ratio plotted in a separate %s panel with exact nulls and colors",
    (chartType) => {
      const config = createStudioWidget();
      config.display.chartType = chartType;
      config.queries = ["Support", "Search", "Coding", "Unknown", "Other"].map(
        (label, index) => ({
          ...config.queries[0]!,
          id: String.fromCharCode(97 + index),
          label,
          metrics: [{ id: "cost", measure: "totalCost", aggregation: "sum" }],
        }),
      );
      config.expressions = [
        { id: "ratio", label: "Ratio", formula: "a.cost / (a.cost * 2)" },
      ];
      const series = [
        ...config.queries.map((query) => ({
          id: `${query.id}.cost`,
          queryId: query.id,
          metricId: "cost",
          label: query.label,
          dimensions: {},
          unit: "USD",
          aggregation: "sum",
        })),
        {
          id: "ratio",
          queryId: "ratio",
          metricId: "ratio",
          label: "Ratio",
          dimensions: {},
          unit: "ratio",
          aggregation: "expression",
        },
      ];
      const amounts = [100, 1296, 800, null, 800, 0.5];
      const rows = series.map((series, index) => ({
        seriesId: series.id,
        queryId: series.queryId,
        metricId: series.metricId,
        label: series.label,
        dimensions: {},
        dimension: null,
        time: null,
        value: amounts[index]!,
      }));
      const result: StudioResult = {
        status: "complete",
        series,
        rows,
        summaries: [],
        diagnostics: [],
        warnings: [],
      };
      const prepared = prepareStudioChart(result, config);
      expect(prepared.unitPanels.map((panel) => panel.label)).toEqual([
        "US dollars",
        "Ratio",
      ]);
      const type = chartType === "VERTICAL_BAR" ? "bar" : "horizontal-bar";
      const ordered =
        chartType === "HORIZONTAL_BAR" ? [1, 2, 4, 0, 3] : [0, 1, 2, 3, 4];
      expect(prepared.unitPanels[0]!.visualization.data).toEqual(
        ordered.map((index) =>
          expect.objectContaining({
            value: amounts[index],
            color: prepared.colors[series[index]!.id]!.fillColor,
          }),
        ),
      );
      for (const panel of prepared.unitPanels)
        expect(panel.visualization.type).toBe(type);
      expect(prepared.unitPanels[1]!.visualization.data[0]).toMatchObject({
        value: 0.5,
        color: prepared.colors.ratio!.fillColor,
      });
      config.display.rowLimit = 2;
      const limited = prepareStudioChart(result, config);
      expect(limited.unitPanels[0]!.visualization.data).toEqual(
        ordered
          .slice(0, 2)
          .map((index) => expect.objectContaining({ value: amounts[index] })),
      );
      config.queries[0]!.orderBy = [
        { field: "sum_totalCost", direction: "asc" },
      ];
      expect(
        prepareStudioChart(result, config).unitPanels[0]!.visualization.data,
      ).toEqual([
        expect.objectContaining({ value: 100 }),
        expect.objectContaining({ value: 1296 }),
      ]);
      const missing = prepareStudioChart(
        {
          ...result,
          rows: rows.map((row, index) => ({ ...row, value: index ? null : 0 })),
        },
        config,
      );
      expect(
        missing.unitPanels.map((panel) => panel.visualization.data[0]),
      ).toEqual([
        expect.objectContaining({ value: 0 }),
        expect.objectContaining({ value: null }),
      ]);
    },
  );
  it.each(["LINE_TIME_SERIES", "AREA_TIME_SERIES", "BAR_TIME_SERIES"] as const)(
    "separates cost and ratio into aligned %s panels without changing values, colors or table data",
    (chartType) => {
      const config = createStudioWidget();
      config.display = { chartType, timeSeries: true, unit: "USD" };
      config.queries = ["a", "b", "c"].map((id) => ({
        ...config.queries[0]!,
        id,
        label: `Cost ${id}`,
        metrics: [{ id: "cost", measure: "totalCost", aggregation: "sum" }],
      }));
      config.expressions = [
        { id: "share", label: "Cost ratio", formula: "a.cost / b.cost" },
      ];
      const series = [
        ...config.queries.map((query) => ({
          id: `${query.id}.cost`,
          queryId: query.id,
          metricId: "cost",
          label: query.label,
          dimensions: {},
          unit: "USD",
          aggregation: "sum",
        })),
        {
          id: "share",
          queryId: "share",
          metricId: "share",
          label: "Cost ratio",
          dimensions: {},
          unit: "ratio",
          rawUnit: "ratio",
          aggregation: "expression",
        },
      ];
      const times = [
        "2026-11-18T00:00:00Z",
        "2026-11-19T00:00:00Z",
        "2026-11-20T00:00:00Z",
      ];
      const rows = series.flatMap((series, index) =>
        (index === 3 ? [1] : [0, 1, 2]).map((bucket) => ({
          seriesId: series.id,
          queryId: series.queryId,
          metricId: series.metricId,
          label: series.label,
          dimensions: {},
          dimension: null,
          time: times[bucket],
          value: [
            [4, null, 4],
            [8, 8, 8],
            [12, 12, 12],
            [null, 0.125, null],
          ][index]![bucket]!,
        })),
      );
      const result: StudioResult = {
        status: "complete",
        series,
        rows,
        summaries: [],
        diagnostics: [],
        warnings: [],
      };
      const prepared = prepareStudioChart(result, config);
      expect(prepared.unitPanels.map((panel) => panel.label)).toEqual([
        "US dollars",
        "Ratio",
      ]);
      expect(
        prepared.unitPanels.map((panel) =>
          panel.visibleSeries.map((series) => series.id),
        ),
      ).toEqual([["a.cost", "b.cost", "c.cost"], ["share"]]);
      for (const panel of prepared.unitPanels) {
        expect([
          ...new Set(panel.data.map((point) => point.time_dimension)),
        ]).toEqual(times);
        for (const series of panel.visibleSeries)
          expect(panel.colors[series.id]).toEqual(prepared.colors[series.id]);
        expect(panel.visualization.type).toBe(
          (
            {
              LINE_TIME_SERIES: "line",
              AREA_TIME_SERIES: "area",
              BAR_TIME_SERIES: "stacked-bar",
            } as const
          )[chartType],
        );
        expect(panel.visualization.data).toHaveLength(times.length);
      }
      expect(prepared.unitPanels[1]!.visualization.valueFormatter!(0.125)).toBe(
        "0.125",
      );
      expect(prepared.unitPanels[0]!.visualization.valueFormatter!(4)).toBe(
        "$4.00",
      );
      expect(prepared.unitPanels[1]!.data.map((point) => point.metric)).toEqual(
        [null, 0.125, null],
      );
      expect(
        prepared.unitPanels[0]!.data.find(
          (point) =>
            point.dimension === "a.cost" && point.time_dimension === times[1],
        )?.metric,
      ).toBeNull();
      expect(prepared.data).toHaveLength(rows.length);
      const compatible = prepareStudioChart(
        {
          ...result,
          series: series.slice(0, 3),
          rows: rows.filter((row) => row.queryId !== "share"),
        },
        config,
      );
      expect(compatible.unitPanels).toHaveLength(0);
      for (const units of [
        ["percent", "%"],
        [undefined, "number"],
      ]) {
        const aliases = prepareStudioChart(
          {
            ...result,
            series: series.map((series, index) => ({
              ...series,
              unit: units[index % 2],
              rawUnit: undefined,
            })),
          },
          config,
        );
        expect(aliases.hasIncompatibleUnits).toBe(false);
        expect(aliases.unitPanels).toHaveLength(0);
      }
      const table = prepareStudioChart(result, {
        ...config,
        display: { chartType: "PIVOT_TABLE" },
      });
      expect(table.unitPanels).toHaveLength(0);
      expect(table.pivotTable).toEqual(prepared.pivotTable);
    },
  );
  it("identifies a parameterized percentile in the data used to audit a chart", () => {
    const config = createStudioWidget();
    config.queries[0]!.metrics = [
      { id: "tail", measure: "latency", aggregation: "p50", percentile: 25 },
    ];
    const row = {
      seriesId: "a.tail",
      queryId: "a",
      metricId: "tail",
      label: "Latency",
      dimension: null,
      dimensions: {},
      time: null,
      value: 1500,
    };
    const data = prepareStudioData(
      {
        status: "complete",
        rows: [row],
        summaries: [],
        series: [],
        diagnostics: [],
        warnings: [],
      },
      config,
      { scope: "rows", reference: "all", pageIndex: 0, pageSize: 50 },
    );
    expect(
      data.table.rows[0]?.cells.find((cell) => cell.columnId === "reference")
        ?.value,
    ).toContain("p25");
    expect(
      data.referenceOptions.find((option) => option.value === "a.tail")?.label,
    ).toContain("p25");
  });
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

  it("puts histogram intervals before population labels and compares populations by counted records", () => {
    const config = createStudioWidget();
    config.display = { chartType: "HISTOGRAM", histogramEdges: [0, 1000] };
    config.queries = ["a", "b"].map((id) => ({
      ...config.queries[0]!,
      id,
      label:
        id === "a"
          ? "Production observation latency"
          : "Staging observation latency",
      metrics: [
        {
          id: "latency",
          label: "Latency",
          measure: "latency",
          aggregation: "histogram",
        },
        {
          id: "first",
          label: "First token",
          measure: "timeToFirstToken",
          aggregation: "histogram",
        },
      ],
      dimensions: [{ field: "providedModelName" }],
    }));
    const populations = [
      {
        queryId: "a",
        metricId: "latency",
        aggregation: "histogram",
        dimensions: { providedModelName: "Model one" },
      },
      {
        queryId: "a",
        metricId: "first",
        aggregation: "histogram",
        dimensions: { providedModelName: "Model one" },
      },
      {
        queryId: "b",
        metricId: "latency",
        aggregation: "histogram",
        dimensions: { providedModelName: "Model two" },
      },
    ];
    const result: StudioResult = {
      status: "complete",
      series: populations.map((population) => ({
        ...population,
        id: `${population.queryId}.${population.metricId}`,
        label: "Observation latency that must not obscure the interval",
        unit: "observations",
        bucketUnit: "milliseconds",
      })),
      rows: populations.flatMap((population, index) =>
        ["[0, 1000)", "No value"].map((dimension) => ({
          ...population,
          seriesId: `${population.queryId}.${population.metricId}`,
          label: "Observation latency that must not obscure the interval",
          dimensions: {
            ...population.dimensions,
            bin: dimension === "No value" ? "[null,null]" : "[0,1000]",
          },
          dimension,
          time: null,
          value: index + 1,
        })),
      ),
      summaries: [],
      diagnostics: [],
      warnings: [],
    };
    const prepareVisualization = (input: StudioResult) => {
      const prepared = prepareStudioChart(input, config);
      const { result: chart } = renderHook(() => {
        const chart = usePreparedWidgetChart({
          chartType: "HISTOGRAM",
          data: prepared.data,
          active: true,
        });
        return applyStudioSeriesPresentation(chart.visualization, prepared);
      });
      return chart.current;
    };
    const single = prepareVisualization({
      ...result,
      series: result.series.slice(0, 1),
      rows: result.rows.slice(0, 2),
    });
    expect(single.type).toBe("histogram");
    if (single.type !== "histogram") throw new Error("Expected a histogram");
    expect(single.data.map((bin) => bin.label)).toEqual([
      "[0, 1) s",
      "No value",
    ]);
    expect(single.data.map((bin) => bin.value)).toEqual([1, 1]);
    expect(single.tooltipHeading?.("[0, 1) s")).toContain("[0, 1000) ms");
    expect(single.tooltipHeading?.("[0, 1) s")).toContain("Latency");
    expect(single.valueFormatter?.(1500)).not.toContain("ms");
    expect(single.tooltipValueLabel).toBe("Count (observations)");

    const multiple = prepareVisualization(result);
    expect(multiple.type).toBe("grouped-bar");
    if (multiple.type !== "grouped-bar")
      throw new Error("Expected population comparison");
    expect(multiple.data).toEqual([
      {
        key: "[0, 1) s",
        values: { "a.latency": 1, "a.first": 2, "b.latency": 3 },
      },
      {
        key: "No value",
        values: { "a.latency": 1, "a.first": 2, "b.latency": 3 },
      },
    ]);
    expect(multiple.series.map((series) => series.id)).toEqual([
      "a.latency",
      "a.first",
      "b.latency",
    ]);
    expect(new Set(multiple.series.map((series) => series.label)).size).toBe(3);
    expect(multiple.series[1]?.label).toContain("First token");
    expect(multiple.series[2]?.label).toContain("Staging");
    expect(multiple.valueFormatter?.(1500)).not.toContain("ms");
    expect(multiple.tooltipFormatter?.("[0, 1) s")).toContain("[0, 1000) ms");
    const mobilePrepared = prepareStudioChart(result, config);
    const mobile = applyStudioSeriesPresentation(
      multiple,
      mobilePrepared,
      undefined,
      true,
    );
    expect(mobile.type).toBe("table");
    if (mobile.type !== "table")
      throw new Error("Expected readable mobile bands");
    expect(mobile.columns.map((column) => column.label)).toEqual([
      "Band",
      "Count",
    ]);
    expect(
      mobile.rows.map(
        (row) => row.cells.find((cell) => cell.columnId === "band")?.value,
      ),
    ).toEqual([
      mobilePrepared.visibleSeries[0]!.label,
      "[0, 1) s",
      "No value",
      mobilePrepared.visibleSeries[1]!.label,
      "[0, 1) s",
      "No value",
      mobilePrepared.visibleSeries[2]!.label,
      "[0, 1) s",
      "No value",
    ]);
    expect(
      mobile.rows[1]?.cells.find((cell) => cell.columnId === "band")?.detail,
    ).toContain("[0, 1000) ms");
    expect(
      mobile.rows[1]?.cells.find((cell) => cell.columnId === "count")?.value,
    ).toBe("1");
    expect(
      prepareStudioData(result, config, {
        scope: "rows",
        reference: "all",
        pageIndex: 0,
        pageSize: 50,
      }).rowCount,
    ).toBe(6);
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
