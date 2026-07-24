import { z } from "zod";
import startCase from "lodash/startCase";

import {
  DashboardWidgetChartType,
  singleFilter,
  type FilterState,
} from "@langfuse/shared";
import {
  getValidAggregationsForMeasureType,
  metricAggregations,
  requiresV2,
  viewDeclarations,
  views,
  type ViewVersion,
} from "@langfuse/shared/query";

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
  MAX_PIVOT_TABLE_DIMENSIONS,
  MAX_PIVOT_TABLE_METRICS,
} from "@/src/features/widgets/utils/pivot-table-utils";

/**
 * The set of widget chart types that accept a breakdown dimension. This mirrors
 * `chartTypes[].supportsBreakdown` in WidgetForm.tsx; WidgetForm imports
 * {@link widgetChartTypeSupportsBreakdown} so the two never drift. `NUMBER` and
 * `HISTOGRAM` are the two total-value charts that take no dimension.
 */
const BREAKDOWN_CAPABLE_CHART_TYPES = new Set<string>([
  "LINE_TIME_SERIES",
  "BAR_TIME_SERIES",
  "AREA_TIME_SERIES",
  "HORIZONTAL_BAR",
  "VERTICAL_BAR",
  "PIE",
  "PIVOT_TABLE",
]);

/** widgetChartTypeSupportsBreakdown is the single source of truth for whether a chart type takes a breakdown dimension. */
export function widgetChartTypeSupportsBreakdown(type: string): boolean {
  return BREAKDOWN_CAPABLE_CHART_TYPES.has(type);
}

/**
 * Pure function that resolves the correct aggregation and chart type given the
 * current selections and valid aggregation list. Returns null when no change is
 * needed.
 *
 * All constraints are resolved in a single pass so the output is a fixed point
 * (running the function again on its own output always returns null). This
 * prevents infinite React state-update loops when constraints conflict — e.g.
 * HISTOGRAM requires "histogram" aggregation but "count" measure forces "count".
 */
export function resolveAggregationAndChartType(params: {
  chartType: string;
  measure: string;
  currentAgg: string;
  validAggs: z.infer<typeof metricAggregations>[];
}): {
  aggregation?: z.infer<typeof metricAggregations>;
  chartType?: string;
} | null {
  const { chartType, measure, currentAgg, validAggs } = params;
  const supportsHistogram = validAggs.includes("histogram");

  let targetChart = chartType;
  let targetAgg = currentAgg as z.infer<typeof metricAggregations>;

  // HISTOGRAM chart needs a histogram-compatible measure
  if (targetChart === "HISTOGRAM") {
    if (!supportsHistogram) {
      targetChart = "NUMBER";
    } else {
      targetAgg = "histogram";
    }
  }

  // Non-HISTOGRAM chart can't keep histogram aggregation
  if (targetChart !== "HISTOGRAM" && targetAgg === "histogram") {
    targetAgg =
      measure === "count"
        ? "count"
        : ((validAggs[0] ?? "sum") as z.infer<typeof metricAggregations>);
  }

  // "count" measure only supports "count" aggregation. If this conflicts with
  // the chart type (e.g. HISTOGRAM requires "histogram"), bail the chart type
  // rather than creating an unresolvable conflict.
  if (measure === "count" && targetAgg !== "count") {
    if (targetChart === "HISTOGRAM") {
      targetChart = "NUMBER";
    }
    targetAgg = "count";
  }

  // Current aggregation not valid for the measure type
  if (!validAggs.includes(targetAgg)) {
    targetAgg = (validAggs[0] ?? "count") as z.infer<typeof metricAggregations>;
  }

  // Only return if something changed
  const result: {
    aggregation?: z.infer<typeof metricAggregations>;
    chartType?: string;
  } = {};
  if (targetChart !== chartType) result.chartType = targetChart;
  if (targetAgg !== currentAgg) result.aggregation = targetAgg;

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * A single measure + aggregation pair, matching the save payload's `metrics[]`
 * element (minus the string `agg` alias). `measure` is intentionally NOT
 * `.min(1)`: a pivot table may carry a trailing empty "Add Metric" slot that the
 * user has not filled yet (matching the legacy form, which filtered empty slots
 * at save). The "at least one non-empty metric / no empty non-pivot metric"
 * rule lives in `superRefine`, and `toSavePayload` drops empty slots.
 */
export const MetricFieldSchema = z.object({
  measure: z.string(),
  aggregation: metricAggregations,
});
export type MetricField = z.infer<typeof MetricFieldSchema>;

/** A pivot-table default sort column + direction. `null` on the form means "no default sort". */
export const SortFieldSchema = z.object({
  column: z.string().min(1),
  order: z.enum(["ASC", "DESC"]),
});
export type SortField = z.infer<typeof SortFieldSchema>;

/**
 * The unified, one-concept-one-field widget form schema. The dual
 * single-metric / pivot-metrics (and single-dimension / pivot-dimensions)
 * representation of the legacy form is collapsed into `metrics[]` and
 * `dimensions[]` arrays that already match the `onSave` payload shape.
 *
 * `chart` is a FLAT record (not a discriminated union): a union keyed on
 * `chart.type` would churn react-hook-form field arrays every time the chart
 * type changes. Instead the cross-field invariants live in `superRefine`.
 *
 * The factory is parameterised by `viewVersion` because the histogram
 * measure-capability check (invariant 1) reads the measure's type from the
 * version-specific view declaration.
 */
export function makeWidgetFormSchema(viewVersion: ViewVersion) {
  return z
    .object({
      // Blank (null) name/description means "use the live auto-suggestion";
      // see toSavePayload + NameField for the override-vs-suggestion model.
      name: z.string().nullable(),
      description: z.string().nullable(),
      view: views,
      filters: z.array(singleFilter),
      metrics: z.array(MetricFieldSchema).min(1),
      dimensions: z.array(z.object({ field: z.string() })),
      chart: z.object({
        type: z.enum(DashboardWidgetChartType),
        bins: z.coerce.number().int().min(1).max(100),
        rowLimit: z.coerce.number().int().min(0).max(1000),
        sort: SortFieldSchema.nullable(),
      }),
    })
    .superRefine((values, ctx) => {
      const isPivot = values.chart.type === "PIVOT_TABLE";
      const isHistogram = values.chart.type === "HISTOGRAM";
      const supportsBreakdown = widgetChartTypeSupportsBreakdown(
        values.chart.type,
      );

      // Invariant 3: a non-breakdown chart type cannot carry a dimension.
      if (!supportsBreakdown && values.dimensions.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["dimensions"],
          message: "This chart type does not support a breakdown dimension.",
        });
      }

      // Invariant 4: pivot vs. non-pivot metric/dimension cardinality.
      if (isPivot) {
        const nonEmptyMetrics = values.metrics.filter(
          (m) => m.measure && m.measure !== "",
        );
        if (nonEmptyMetrics.length < 1) {
          ctx.addIssue({
            code: "custom",
            path: ["metrics"],
            message: "At least one metric is required for pivot tables.",
          });
        }
        if (values.metrics.length > MAX_PIVOT_TABLE_METRICS) {
          ctx.addIssue({
            code: "custom",
            path: ["metrics"],
            message: `A pivot table supports at most ${MAX_PIVOT_TABLE_METRICS} metrics.`,
          });
        }
        if (values.dimensions.length > MAX_PIVOT_TABLE_DIMENSIONS) {
          ctx.addIssue({
            code: "custom",
            path: ["dimensions"],
            message: `A pivot table supports at most ${MAX_PIVOT_TABLE_DIMENSIONS} dimensions.`,
          });
        }
      } else {
        if (values.metrics.length !== 1) {
          ctx.addIssue({
            code: "custom",
            path: ["metrics"],
            message: "This chart type requires exactly one metric.",
          });
        } else if (!values.metrics[0].measure) {
          ctx.addIssue({
            code: "custom",
            path: ["metrics", 0, "measure"],
            message: "Select a measure.",
          });
        }
        if (values.dimensions.length > 1) {
          ctx.addIssue({
            code: "custom",
            path: ["dimensions"],
            message:
              "This chart type supports at most one breakdown dimension.",
          });
        }
      }

      // Invariant 1: a HISTOGRAM needs a single, histogram-capable metric using
      // the histogram aggregation. This is the histogram-incompatible case as a
      // REAL validation error rather than a silent revert.
      if (isHistogram) {
        if (values.metrics.length !== 1) {
          ctx.addIssue({
            code: "custom",
            path: ["chart", "type"],
            message: "A histogram uses a single metric.",
          });
        } else {
          const metric = values.metrics[0];
          if (metric.aggregation !== "histogram") {
            ctx.addIssue({
              code: "custom",
              path: ["metrics", 0, "aggregation"],
              message: "A histogram requires the histogram aggregation.",
            });
          }
          const measureType =
            viewDeclarations[viewVersion][values.view]?.measures?.[
              metric.measure
            ]?.type;
          const histogramCapable =
            getValidAggregationsForMeasureType(measureType).includes(
              "histogram",
            ) && metric.measure !== "count";
          if (!histogramCapable) {
            ctx.addIssue({
              code: "custom",
              path: ["chart", "type"],
              message: "This measure cannot be shown as a histogram.",
            });
          }
        }
      } else if (values.metrics.some((m) => m.aggregation === "histogram")) {
        // Invariant 2: outside a histogram chart no metric may use the
        // histogram aggregation.
        ctx.addIssue({
          code: "custom",
          path: ["metrics", 0, "aggregation"],
          message:
            "The histogram aggregation is only valid for histogram charts.",
        });
      }
    });
}

export type WidgetFormSchema = ReturnType<typeof makeWidgetFormSchema>;
export type WidgetFormValues = z.infer<WidgetFormSchema>;

/**
 * The shape WidgetForm receives as `initialValues` — the legacy prop contract,
 * kept verbatim so create/edit pages need no changes to what they pass.
 */
export type WidgetInitialValues = {
  name: string;
  description: string;
  view: z.infer<typeof views>;
  measure: string;
  aggregation: z.infer<typeof metricAggregations>;
  dimension: string;
  filters?: FilterState;
  chartType: WidgetFormValues["chart"]["type"];
  chartConfig?: WidgetChartConfig;
  metrics?: { measure: string; agg: string }[];
  dimensions?: { field: string }[];
  minVersion?: number;
};

/** The exact object shape passed to `onSave` — unchanged from the legacy form. */
export type WidgetSavePayload = {
  name: string;
  description: string;
  view: string;
  dimensions: { field: string }[];
  metrics: { measure: string; agg: string }[];
  filters: FilterState;
  chartType: WidgetFormValues["chart"]["type"];
  chartConfig: WidgetChartConfig;
  minVersion: number;
};

/**
 * The frozen, view-shape-derived base minVersion for a widget, computed from the
 * `initialValues` at mount. Mirrors the legacy `initialWidgetRequiresV2 ? 2 :
 * (initialValues.minVersion ?? 1)`.
 */
export function deriveWidgetBaseMinVersion(
  initialValues: WidgetInitialValues,
): number {
  const initialWidgetRequiresV2 = requiresV2({
    view: initialValues.view,
    dimensions:
      initialValues.dimensions ??
      (initialValues.dimension && initialValues.dimension !== "none"
        ? [{ field: initialValues.dimension }]
        : []),
    measures: initialValues.metrics?.map((metric) => ({
      measure: metric.measure,
    })) ?? [{ measure: initialValues.measure }],
    filters: initialValues.filters ?? [],
  });
  return initialWidgetRequiresV2 ? 2 : (initialValues.minVersion ?? 1);
}

/**
 * Derives the effective view version (query-engine v1/v2) from the current view
 * plus the frozen base minVersion and the beta flag. Mirrors the legacy
 * `initialWidgetRequiresV2 || widgetMinVersion >= 2 || (isBetaEnabled && view
 * !== "traces")`. Traces has no v2-only fields, so beta never promotes it.
 */
export function resolveWidgetViewVersion(params: {
  view: z.infer<typeof views>;
  baseMinVersion: number;
  isBetaEnabled: boolean;
}): ViewVersion {
  return params.baseMinVersion >= 2 ||
    (params.isBetaEnabled && params.view !== "traces")
    ? "v2"
    : "v1";
}

/** Sanitized pivot default sort for the current metric/dimension selection, or undefined when the stored sort no longer applies. */
export function deriveEffectiveSort(
  values: WidgetFormValues,
): SortField | undefined {
  if (values.chart.type !== "PIVOT_TABLE") return undefined;
  return sanitizePivotTableDefaultSort(values.chart.sort ?? undefined, {
    dimensions: values.dimensions.filter((d) => d.field && d.field !== "none"),
    metrics: values.metrics
      .filter((m) => m.measure && m.measure !== "")
      .map((m) => ({ measure: m.measure, agg: m.aggregation })),
  });
}

/**
 * Live auto-suggested name/description for the current selection. Ports the two
 * legacy auto-name/description effects (WidgetForm.tsx :1475 / :1517). The
 * description uses the UI-space editor filters (`values.filters`), matching the
 * legacy behaviour.
 */
export function deriveWidgetSuggestions(values: WidgetFormValues): {
  name: string;
  description: string;
} {
  const isPivot = values.chart.type === "PIVOT_TABLE";
  const validMetrics = values.metrics.filter(
    (m) => m.measure && m.measure !== "",
  );
  const metricNames =
    isPivot && validMetrics.length > 0
      ? validMetrics.map((m) => `${m.aggregation}_${m.measure}`)
      : undefined;
  const dimensionForNaming =
    isPivot && values.dimensions.length > 0
      ? values.dimensions.map((d) => startCase(d.field)).join(" and ")
      : (values.dimensions[0]?.field ?? "none");

  const aggregation = isPivot
    ? "count"
    : (values.metrics[0]?.aggregation ?? "count");
  const measure = isPivot ? "count" : (values.metrics[0]?.measure ?? "count");

  return {
    name: buildWidgetName({
      aggregation,
      measure,
      dimension: dimensionForNaming,
      view: values.view,
      metrics: metricNames,
      isMultiMetric: isPivot && validMetrics.length > 0,
    }),
    description: buildWidgetDescription({
      aggregation,
      measure,
      dimension: dimensionForNaming,
      view: values.view,
      filters: values.filters,
      metrics: metricNames,
      isMultiMetric: isPivot && validMetrics.length > 0,
    }),
  };
}

/** effectiveWidgetName resolves the override-vs-suggestion name used for save + query. A blank/whitespace override falls back to the live suggestion. */
export function effectiveWidgetName(
  override: string | null,
  suggested: string,
): string {
  return override && override.trim().length > 0 ? override : suggested;
}

/**
 * normalizeWidgetFormValues heals a candidate form state into a VALID one using
 * the same pure logic the legacy mount/measure/chart-type effects applied:
 *
 * - non-pivot charts keep a single metric and at most one dimension;
 * - the (chart type, leading aggregation) pair is resolved via
 *   {@link resolveAggregationAndChartType} — e.g. a HISTOGRAM on a
 *   non-histogram-capable measure falls back to NUMBER, a stranded histogram
 *   aggregation resolves to a real one;
 * - a breakdown dimension the (possibly healed) chart type cannot carry is
 *   dropped.
 *
 * `resolveAggregationAndChartType` is a fixed point, so a VALID widget
 * normalizes to itself (preserving save parity); an INVALID stored/imported
 * widget heals exactly as the old mount effects would have. This replaces those
 * effects at the seed/cascade seams so no invalid state can mount or arise from
 * a view change — with no `useEffect`.
 */
export function normalizeWidgetFormValues(
  values: WidgetFormValues,
  viewVersion: ViewVersion,
): WidgetFormValues {
  const isPivot = values.chart.type === "PIVOT_TABLE";
  let metrics = values.metrics;
  let dimensions = values.dimensions;

  if (!isPivot) {
    if (metrics.length > 1) metrics = metrics.slice(0, 1);
    if (dimensions.length > 1) dimensions = dimensions.slice(0, 1);
  }

  const measure = metrics[0]?.measure ?? "count";
  const currentAgg = metrics[0]?.aggregation ?? "count";
  const measureType =
    viewDeclarations[viewVersion][values.view]?.measures?.[measure]?.type;
  const resolved = resolveAggregationAndChartType({
    chartType: values.chart.type,
    measure,
    currentAgg,
    validAggs: getValidAggregationsForMeasureType(measureType),
  });

  let chartType = values.chart.type;
  if (resolved?.chartType) {
    chartType = resolved.chartType as WidgetFormValues["chart"]["type"];
  }
  if (resolved?.aggregation && metrics.length > 0) {
    const healedAgg = resolved.aggregation;
    metrics = metrics.map((m, i) =>
      i === 0 ? { ...m, aggregation: healedAgg } : m,
    );
  }

  if (!widgetChartTypeSupportsBreakdown(chartType)) {
    dimensions = [];
  }

  return {
    ...values,
    metrics,
    dimensions,
    chart: { ...values.chart, type: chartType },
  };
}

/**
 * applyChartTypeChange heals the form when the chart type changes.
 *
 * Crossing the pivot ↔ non-pivot boundary RESETS `dimensions` to `[]`: the
 * single breakdown dimension (non-pivot) and the pivot row dimensions are
 * distinct concepts that the legacy form kept as separate state, so neither
 * carries across the boundary — a breakdown defaults to "none" when entering a
 * non-pivot chart, and a pivot starts with empty row dimensions. Switching
 * WITHIN the non-pivot breakdown charts (e.g. bar ↔ line) keeps the breakdown
 * dimension. The result is then run through {@link normalizeWidgetFormValues}
 * for the aggregation/chart-type resolution and unsupported-dimension wipe.
 */
export function applyChartTypeChange(
  values: WidgetFormValues,
  newType: WidgetFormValues["chart"]["type"],
  viewVersion: ViewVersion,
): WidgetFormValues {
  const crossesPivotBoundary =
    (values.chart.type === "PIVOT_TABLE") !== (newType === "PIVOT_TABLE");
  return normalizeWidgetFormValues(
    {
      ...values,
      dimensions: crossesPivotBoundary ? [] : values.dimensions,
      chart: { ...values.chart, type: newType },
    },
    viewVersion,
  );
}

/**
 * toDefaultValues maps the legacy `initialValues` prop into the unified form
 * values, replacing the 17 legacy useState initializers (including
 * pivot-vs-single metric/dimension seeding and the pivot default-sort seed).
 * The seeded values are normalized ({@link normalizeWidgetFormValues}) so a
 * malformed stored/imported widget mounts VALID — reproducing the legacy
 * mount-time resolve + breakdown-wipe effects without an effect.
 */
export function toDefaultValues(
  initialValues: WidgetInitialValues,
  viewVersion: ViewVersion,
): WidgetFormValues {
  const isPivot = initialValues.chartType === "PIVOT_TABLE";

  const metrics: MetricField[] =
    isPivot && initialValues.metrics?.length
      ? initialValues.metrics.map((m) => ({
          measure: m.measure,
          aggregation: m.agg as z.infer<typeof metricAggregations>,
        }))
      : [
          {
            measure: initialValues.measure,
            aggregation: initialValues.aggregation,
          },
        ];

  const dimensions = isPivot
    ? initialValues.dimensions?.length
      ? initialValues.dimensions.map((d) => ({ field: d.field }))
      : []
    : initialValues.dimension && initialValues.dimension !== "none"
      ? [{ field: initialValues.dimension }]
      : [];

  const sort: SortField | null = isPivot
    ? (sanitizePivotTableDefaultSort(initialValues.chartConfig?.defaultSort, {
        dimensions: initialValues.dimensions ?? [],
        metrics:
          initialValues.metrics ??
          (initialValues.measure && initialValues.aggregation
            ? [
                {
                  measure: initialValues.measure,
                  agg: initialValues.aggregation,
                },
              ]
            : []),
      }) ?? null)
    : null;

  return normalizeWidgetFormValues(
    {
      // A blank initial name/description is "auto" (null → show the live
      // suggestion); a non-empty one is an explicit override that sticks. This
      // is how edit mode seeds the saved name so it does not auto-update.
      name:
        initialValues.name && initialValues.name.length > 0
          ? initialValues.name
          : null,
      description:
        initialValues.description && initialValues.description.length > 0
          ? initialValues.description
          : null,
      view: initialValues.view,
      filters: normalizeStoredWidgetFiltersForEditor(
        initialValues.view,
        initialValues.filters ?? [],
      ).editorFilters,
      metrics,
      dimensions,
      chart: {
        type: initialValues.chartType,
        bins: initialValues.chartConfig?.bins ?? 10,
        rowLimit: initialValues.chartConfig?.row_limit ?? 100,
        sort,
      },
    },
    viewVersion,
  );
}

/**
 * toSavePayload folds the form values into the exact `onSave` object the legacy
 * `handleSaveWidget` produced (WidgetForm.tsx :1430-1471), byte for byte:
 * name/description fall back to the live suggestions, filters are mapped into
 * view space, the per-type chartConfig is rebuilt, and `minVersion` is derived
 * from the query shape via `requiresV2`.
 */
export function toSavePayload(
  values: WidgetFormValues,
  params: {
    suggestedName: string;
    suggestedDescription: string;
    effectiveSort: SortField | undefined;
  },
): WidgetSavePayload {
  const isPivot = values.chart.type === "PIVOT_TABLE";
  const validMetrics = values.metrics.filter(
    (m) => m.measure && m.measure !== "",
  );

  const saveDimensions = isPivot
    ? values.dimensions.map((d) => ({ field: d.field }))
    : values.dimensions.length > 0 && values.dimensions[0].field !== "none"
      ? [{ field: values.dimensions[0].field }]
      : [];

  const saveMetrics = isPivot
    ? validMetrics.map((m) => ({ measure: m.measure, agg: m.aggregation }))
    : [
        {
          measure: values.metrics[0].measure,
          agg: values.metrics[0].aggregation,
        },
      ];

  const normalizedFilters = mapWidgetUiTableFilterToView(
    values.view,
    values.filters,
  );

  const chartType = values.chart.type;
  const chartConfig: WidgetChartConfig = isTimeSeriesChart(chartType)
    ? { type: chartType }
    : chartType === "HISTOGRAM"
      ? { type: chartType, bins: values.chart.bins }
      : chartType === "PIVOT_TABLE"
        ? {
            type: chartType,
            row_limit: values.chart.rowLimit,
            defaultSort: params.effectiveSort ?? undefined,
          }
        : { type: chartType, row_limit: values.chart.rowLimit };

  return {
    name: effectiveWidgetName(values.name, params.suggestedName),
    description: effectiveWidgetName(
      values.description,
      params.suggestedDescription,
    ),
    view: values.view,
    dimensions: saveDimensions,
    metrics: saveMetrics,
    filters: normalizedFilters,
    chartType,
    chartConfig,
    minVersion: requiresV2({
      view: values.view,
      dimensions: saveDimensions,
      measures: saveMetrics.map((m) => ({ measure: m.measure })),
      filters: normalizedFilters,
    })
      ? 2
      : 1,
  };
}
