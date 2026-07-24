import startCase from "lodash/startCase";
import { type z } from "zod";

import { requiresV2, type metricAggregations } from "@langfuse/shared/query";
import {
  mapWidgetUiTableFilterToView,
  normalizeStoredWidgetFiltersForEditor,
} from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import {
  buildWidgetDescription,
  buildWidgetName,
  sanitizePivotTableDefaultSort,
  type WidgetChartConfig,
} from "@/src/features/widgets/utils";

import {
  applyChartTypeChange,
  deriveEffectiveSort,
  deriveWidgetBaseMinVersion,
  deriveWidgetSuggestions,
  resolveWidgetViewVersion,
  toDefaultValues,
  toSavePayload,
  type WidgetFormValues,
  type WidgetInitialValues,
  type WidgetSavePayload,
} from "./widgetFormSchema";

/** The view version the app would seed with for a given widget (non-beta). */
const fixtureViewVersion = (iv: WidgetInitialValues) =>
  resolveWidgetViewVersion({
    view: iv.view,
    baseMinVersion: deriveWidgetBaseMinVersion(iv),
    isBetaEnabled: false,
  });

/**
 * An INDEPENDENT reconstruction of the legacy `handleSaveWidget` object builder
 * (WidgetForm.tsx :1430-1471), driven off the legacy single/pivot state seeding,
 * the auto-name/description effects, and the pivot default-sort sanitize effect.
 * It is deliberately written from the ORIGINAL component logic — not from the
 * new adapters — so that a shape-mapping bug in `toDefaultValues`/`toSavePayload`
 * is caught by the deep-equality assertion below.
 */
function legacyReconstruct(iv: WidgetInitialValues): WidgetSavePayload {
  const isPivot = iv.chartType === "PIVOT_TABLE";

  const selectedMeasure = iv.measure;
  const selectedAggregation = iv.aggregation;
  const selectedDimension = iv.dimension;

  const selectedMetrics =
    isPivot && iv.metrics?.length
      ? iv.metrics.map((m) => ({
          id: `${m.agg}_${m.measure}`,
          measure: m.measure,
          aggregation: m.agg as z.infer<typeof metricAggregations>,
        }))
      : [
          {
            id: `${iv.aggregation}_${iv.measure}`,
            measure: iv.measure,
            aggregation: iv.aggregation,
          },
        ];

  const pivotDimensions =
    isPivot && iv.dimensions?.length ? iv.dimensions.map((d) => d.field) : [];

  const initialDefaultSort = isPivot
    ? sanitizePivotTableDefaultSort(iv.chartConfig?.defaultSort, {
        dimensions: iv.dimensions ?? [],
        metrics:
          iv.metrics ??
          (iv.measure && iv.aggregation
            ? [{ measure: iv.measure, agg: iv.aggregation }]
            : []),
      })
    : undefined;

  let defaultSortColumn = initialDefaultSort?.column ?? "none";
  let defaultSortOrder: "ASC" | "DESC" = initialDefaultSort?.order ?? "DESC";

  const rowLimit = iv.chartConfig?.row_limit ?? 100;
  const histogramBins = iv.chartConfig?.bins ?? 10;

  const userFilterState = normalizeStoredWidgetFiltersForEditor(
    iv.view,
    iv.filters ?? [],
  ).editorFilters;

  // Legacy sort-sanitize effect (:541): drop a stale sort column.
  if (isPivot) {
    const sanitized = sanitizePivotTableDefaultSort(
      defaultSortColumn !== "none"
        ? { column: defaultSortColumn, order: defaultSortOrder }
        : undefined,
      {
        dimensions: pivotDimensions
          .filter((field) => field && field !== "none")
          .map((field) => ({ field })),
        metrics: selectedMetrics
          .filter((metric) => metric.measure && metric.measure !== "")
          .map((metric) => ({
            measure: metric.measure,
            agg: metric.aggregation,
          })),
      },
    );
    if (defaultSortColumn !== "none" && !sanitized) {
      defaultSortColumn = "none";
      defaultSortOrder = "DESC";
    }
  }

  // Legacy auto-name / auto-description (create: suggestion; edit: sticks).
  const validMetricsForNaming = selectedMetrics.filter(
    (m) => m.measure && m.measure !== "",
  );
  const dimensionForNaming =
    isPivot && pivotDimensions.length > 0
      ? pivotDimensions.map(startCase).join(" and ")
      : selectedDimension;
  const metricNames =
    isPivot && validMetricsForNaming.length > 0
      ? validMetricsForNaming.map((m) => m.id)
      : undefined;

  // buildWidgetName / buildWidgetDescription are shared with the adapter; the
  // structural arg construction above is what the parity check exercises.
  const suggestedName = buildWidgetName({
    aggregation: isPivot ? "count" : selectedAggregation,
    measure: isPivot ? "count" : selectedMeasure,
    dimension: dimensionForNaming,
    view: iv.view,
    metrics: metricNames,
    isMultiMetric: isPivot && validMetricsForNaming.length > 0,
  });
  const suggestedDescription = buildWidgetDescription({
    aggregation: isPivot ? "count" : selectedAggregation,
    measure: isPivot ? "count" : selectedMeasure,
    dimension: dimensionForNaming,
    view: iv.view,
    filters: userFilterState,
    metrics: metricNames,
    isMultiMetric: isPivot && validMetricsForNaming.length > 0,
  });

  const widgetName = iv.name && iv.name.length > 0 ? iv.name : suggestedName;
  const widgetDescription =
    iv.description && iv.description.length > 0
      ? iv.description
      : suggestedDescription;

  const validMetrics = selectedMetrics.filter(
    (m) => m.measure && m.measure !== "",
  );
  const saveDimensions = isPivot
    ? pivotDimensions.map((field) => ({ field }))
    : selectedDimension !== "none"
      ? [{ field: selectedDimension }]
      : [];
  const saveMetrics = isPivot
    ? validMetrics.map((m) => ({ measure: m.measure, agg: m.aggregation }))
    : [{ measure: selectedMeasure, agg: selectedAggregation }];

  const normalizedUserFilters = mapWidgetUiTableFilterToView(
    iv.view,
    userFilterState,
  );

  const chartConfig: WidgetChartConfig = isTimeSeriesChart(iv.chartType)
    ? { type: iv.chartType }
    : iv.chartType === "HISTOGRAM"
      ? { type: iv.chartType, bins: histogramBins }
      : iv.chartType === "PIVOT_TABLE"
        ? {
            type: iv.chartType,
            row_limit: rowLimit,
            defaultSort:
              defaultSortColumn && defaultSortColumn !== "none"
                ? { column: defaultSortColumn, order: defaultSortOrder }
                : undefined,
          }
        : { type: iv.chartType, row_limit: rowLimit };

  return {
    name: widgetName,
    description: widgetDescription,
    view: iv.view,
    dimensions: saveDimensions,
    metrics: saveMetrics,
    filters: normalizedUserFilters,
    chartType: iv.chartType,
    chartConfig,
    minVersion: requiresV2({
      view: iv.view,
      dimensions: saveDimensions,
      measures: saveMetrics.map((m) => ({ measure: m.measure })),
      filters: normalizedUserFilters,
    })
      ? 2
      : 1,
  };
}

/** Runs the new adapter path: initialValues → form values → save payload. */
function adapterSavePayload(iv: WidgetInitialValues): WidgetSavePayload {
  const values = toDefaultValues(iv, fixtureViewVersion(iv));
  const suggestions = deriveWidgetSuggestions(values);
  const effectiveSort = deriveEffectiveSort(values);
  return toSavePayload(values, {
    suggestedName: suggestions.name,
    suggestedDescription: suggestions.description,
    effectiveSort,
  });
}

const fixtures: Record<string, WidgetInitialValues> = {
  "regular line (create)": {
    name: "",
    description: "",
    view: "observations",
    measure: "latency",
    aggregation: "avg",
    dimension: "none",
    filters: [],
    chartType: "LINE_TIME_SERIES",
    chartConfig: { type: "LINE_TIME_SERIES" },
  },
  "breakdown bar with dimension": {
    name: "",
    description: "",
    view: "observations",
    measure: "totalCost",
    aggregation: "sum",
    dimension: "environment",
    filters: [],
    chartType: "VERTICAL_BAR",
    chartConfig: { type: "VERTICAL_BAR", row_limit: 25 },
  },
  "count measure big number": {
    name: "",
    description: "",
    view: "observations",
    measure: "count",
    aggregation: "count",
    dimension: "none",
    filters: [],
    chartType: "NUMBER",
    chartConfig: { type: "NUMBER" },
  },
  histogram: {
    name: "",
    description: "",
    view: "observations",
    measure: "latency",
    aggregation: "histogram",
    dimension: "none",
    filters: [],
    chartType: "HISTOGRAM",
    chartConfig: { type: "HISTOGRAM", bins: 25 },
  },
  "pivot with sort (edit-mode arrays)": {
    name: "My Pivot Widget",
    description: "A saved description",
    view: "observations",
    measure: "latency",
    aggregation: "avg",
    dimension: "environment",
    filters: [],
    chartType: "PIVOT_TABLE",
    metrics: [
      { measure: "latency", agg: "avg" },
      { measure: "count", agg: "count" },
    ],
    dimensions: [{ field: "environment" }, { field: "name" }],
    chartConfig: {
      type: "PIVOT_TABLE",
      row_limit: 50,
      defaultSort: { column: "avg_latency", order: "DESC" },
    },
    minVersion: 1,
  },
  "pivot with stale sort column dropped": {
    name: "Stale Sort Pivot",
    description: "desc",
    view: "observations",
    measure: "latency",
    aggregation: "avg",
    dimension: "environment",
    filters: [],
    chartType: "PIVOT_TABLE",
    metrics: [{ measure: "latency", agg: "avg" }],
    dimensions: [{ field: "environment" }],
    // sort references a metric that is no longer present -> must be dropped
    chartConfig: {
      type: "PIVOT_TABLE",
      row_limit: 100,
      defaultSort: { column: "sum_totalCost", order: "ASC" },
    },
    minVersion: 1,
  },
  "edit non-pivot single metric (arrays ignored)": {
    name: "Edited Widget",
    description: "Edited description",
    view: "observations",
    measure: "totalCost",
    aggregation: "sum",
    dimension: "environment",
    filters: [],
    chartType: "LINE_TIME_SERIES",
    metrics: [{ measure: "totalCost", agg: "sum" }],
    dimensions: [{ field: "environment" }],
    chartConfig: { type: "LINE_TIME_SERIES" },
    minVersion: 1,
  },
  // Exercises the filter double-transform path: stored view-space filters go
  // through normalizeStoredWidgetFiltersForEditor (on seed) and back through
  // mapWidgetUiTableFilterToView (on save). Parity holds because BOTH the
  // adapter and the legacy reconstruction apply the identical transforms.
  "line with a stored environment filter": {
    name: "",
    description: "",
    view: "observations",
    measure: "count",
    aggregation: "count",
    dimension: "none",
    filters: [
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["production"],
      },
    ],
    chartType: "LINE_TIME_SERIES",
    chartConfig: { type: "LINE_TIME_SERIES" },
  },
};

describe("widget form adapters round-trip parity", () => {
  it.each(Object.entries(fixtures))(
    "%s: toSavePayload(toDefaultValues(x)) matches the legacy save object",
    (_name, iv) => {
      expect(adapterSavePayload(iv)).toEqual(legacyReconstruct(iv));
    },
  );

  it("regular line create produces the exact legacy save shape", () => {
    expect(adapterSavePayload(fixtures["regular line (create)"])).toEqual({
      name: "Avg Latency (Observations)",
      description: "Shows the avg latency of Observations",
      view: "observations",
      dimensions: [],
      metrics: [{ measure: "latency", agg: "avg" }],
      filters: [],
      chartType: "LINE_TIME_SERIES",
      chartConfig: { type: "LINE_TIME_SERIES" },
      minVersion: 1,
    });
  });

  it("pivot save carries row_limit + sanitized defaultSort and drops stale sort", () => {
    const kept = adapterSavePayload(
      fixtures["pivot with sort (edit-mode arrays)"],
    );
    expect(kept.chartConfig).toEqual({
      type: "PIVOT_TABLE",
      row_limit: 50,
      defaultSort: { column: "avg_latency", order: "DESC" },
    });
    expect(kept.metrics).toEqual([
      { measure: "latency", agg: "avg" },
      { measure: "count", agg: "count" },
    ]);
    expect(kept.dimensions).toEqual([
      { field: "environment" },
      { field: "name" },
    ]);

    const dropped = adapterSavePayload(
      fixtures["pivot with stale sort column dropped"],
    );
    expect(dropped.chartConfig).toEqual({
      type: "PIVOT_TABLE",
      row_limit: 100,
      defaultSort: undefined,
    });
  });

  it("count + NUMBER save carries row_limit and count metric", () => {
    const payload = adapterSavePayload(fixtures["count measure big number"]);
    expect(payload.chartType).toBe("NUMBER");
    expect(payload.chartConfig).toEqual({ type: "NUMBER", row_limit: 100 });
    expect(payload.metrics).toEqual([{ measure: "count", agg: "count" }]);
    expect(payload.name).toBe("Count (Observations)");
  });
});

describe("toDefaultValues normalizes malformed stored/imported widgets", () => {
  it("heals a HISTOGRAM on the count measure to NUMBER (matches the old mount effect)", () => {
    const iv: WidgetInitialValues = {
      name: "Legacy Histogram",
      description: "d",
      view: "observations",
      measure: "count",
      aggregation: "histogram",
      dimension: "none",
      filters: [],
      chartType: "HISTOGRAM",
      chartConfig: { type: "HISTOGRAM", bins: 10 },
      minVersion: 1,
    };
    const values = toDefaultValues(iv, fixtureViewVersion(iv));
    expect(values.chart.type).toBe("NUMBER");
    expect(values.metrics).toEqual([
      { measure: "count", aggregation: "count" },
    ]);

    // And the save payload reflects the healed (valid) state.
    const payload = adapterSavePayload(iv);
    expect(payload.chartType).toBe("NUMBER");
    expect(payload.metrics).toEqual([{ measure: "count", agg: "count" }]);
  });

  it("heals a HISTOGRAM with a stored non-histogram aggregation to the histogram aggregation", () => {
    const iv: WidgetInitialValues = {
      name: "",
      description: "",
      view: "observations",
      measure: "latency",
      aggregation: "avg",
      dimension: "none",
      filters: [],
      chartType: "HISTOGRAM",
      chartConfig: { type: "HISTOGRAM", bins: 10 },
    };
    const values = toDefaultValues(iv, fixtureViewVersion(iv));
    expect(values.chart.type).toBe("HISTOGRAM");
    expect(values.metrics[0].aggregation).toBe("histogram");
  });

  it("drops a stored breakdown dimension on a NUMBER chart (matches the old breakdown-wipe effect)", () => {
    const iv: WidgetInitialValues = {
      name: "Big number with a stray dimension",
      description: "d",
      view: "observations",
      measure: "count",
      aggregation: "count",
      dimension: "environment",
      filters: [],
      chartType: "NUMBER",
      chartConfig: { type: "NUMBER" },
      minVersion: 1,
    };
    const values = toDefaultValues(iv, fixtureViewVersion(iv));
    expect(values.dimensions).toEqual([]);
    expect(adapterSavePayload(iv).dimensions).toEqual([]);
  });

  it("is a fixed point on a valid widget (normalizes to itself)", () => {
    const iv = fixtures["breakdown bar with dimension"];
    const once = toDefaultValues(iv, fixtureViewVersion(iv));
    expect(once.chart.type).toBe("VERTICAL_BAR");
    expect(once.dimensions).toEqual([{ field: "environment" }]);
    expect(once.metrics).toEqual([
      { measure: "totalCost", aggregation: "sum" },
    ]);
  });
});

describe("applyChartTypeChange dimension boundary", () => {
  const pivotWithDims: WidgetFormValues = {
    name: null,
    description: null,
    view: "observations",
    filters: [],
    metrics: [
      { measure: "latency", aggregation: "avg" },
      { measure: "count", aggregation: "count" },
    ],
    dimensions: [{ field: "environment" }, { field: "name" }],
    chart: {
      type: "PIVOT_TABLE",
      bins: 10,
      rowLimit: 100,
      sort: null,
    },
  };

  const barWithBreakdown: WidgetFormValues = {
    name: null,
    description: null,
    view: "observations",
    filters: [],
    metrics: [{ measure: "latency", aggregation: "avg" }],
    dimensions: [{ field: "environment" }],
    chart: { type: "VERTICAL_BAR", bins: 10, rowLimit: 100, sort: null },
  };

  it("pivot([environment, name]) -> vertical bar clears the breakdown to none", () => {
    const next = applyChartTypeChange(pivotWithDims, "VERTICAL_BAR", "v2");
    expect(next.chart.type).toBe("VERTICAL_BAR");
    expect(next.dimensions).toEqual([]);
    // non-pivot trims to a single metric
    expect(next.metrics).toEqual([{ measure: "latency", aggregation: "avg" }]);
  });

  it("vertical bar(breakdown=environment) -> pivot starts with empty row dimensions", () => {
    const next = applyChartTypeChange(barWithBreakdown, "PIVOT_TABLE", "v2");
    expect(next.chart.type).toBe("PIVOT_TABLE");
    expect(next.dimensions).toEqual([]);
  });

  it("vertical bar -> line keeps the breakdown dimension (within non-pivot)", () => {
    const next = applyChartTypeChange(
      barWithBreakdown,
      "LINE_TIME_SERIES",
      "v2",
    );
    expect(next.chart.type).toBe("LINE_TIME_SERIES");
    expect(next.dimensions).toEqual([{ field: "environment" }]);
  });
});
