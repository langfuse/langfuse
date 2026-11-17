import { describe, expect, it } from "vitest";
import { type StudioResult } from "@langfuse/shared";
import { createStudioWidget } from "./catalog";
import { prepareStudioChart } from "./prepareStudioChart";

describe("studio chart preparation", () => {
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
});
