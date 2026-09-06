import startCase from "lodash/startCase";
import { type z } from "zod";
import { type FilterState } from "@langfuse/shared";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import {
  getViewDeclaration,
  views,
  type ViewVersion,
} from "@langfuse/shared/query";
import { formatMetric } from "@/src/features/widgets/chart-library/utils";
import {
  type MetricFormatterFunction,
  type MissingBucketValue,
} from "@/src/features/widgets/chart-library/chart-props";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";

// Shared widget chart configuration types
export type WidgetChartConfig = {
  type: DashboardWidgetChartType;
  row_limit?: number;
  bins?: number;
  /** Draw a dot per sample (line/area). Off by default — chart junk on a dense
   *  series, but the only thing that shows where a sparse one has data. */
  show_data_point_dots?: boolean;
  defaultSort?: {
    column: string;
    order: "ASC" | "DESC";
  };
};

type PivotSortMetric = {
  measure: string;
  agg: string;
};

type PivotSortDimension = {
  field: string;
};

type PivotDefaultSort = NonNullable<WidgetChartConfig["defaultSort"]>;

/**
 * Old widgets can retain stale pivot defaultSort fields after metrics or
 * dimensions change. Ignore those persisted sort keys instead of letting them
 * reach QueryBuilder as invalid orderBy columns.
 */
export function sanitizePivotTableDefaultSort(
  defaultSort: WidgetChartConfig["defaultSort"] | undefined,
  params: {
    dimensions: PivotSortDimension[];
    metrics: PivotSortMetric[];
  },
): PivotDefaultSort | undefined {
  if (!defaultSort) {
    return undefined;
  }

  const validDimensionSort = params.dimensions.some(
    (dimension) => dimension.field === defaultSort.column,
  );
  const validMetricSort = params.metrics.some(
    (metric) => `${metric.agg}_${metric.measure}` === defaultSort.column,
  );

  return validDimensionSort || validMetricSort ? defaultSort : undefined;
}

/**
 * Merges a widget's own filters with the dashboard-injected global filters (the
 * dashboard's environment selector + its filter bar) for the dashboard query.
 * Both sets are ANDed together in the query.
 *
 * A widget's own environment filter WINS: when the widget declares its own
 * environment filter, the dashboard's global environment filter is dropped for
 * that widget. Otherwise the two AND together into an impossible predicate
 * (e.g. `environment IN ("langfuse-llm-as-a-judge") AND environment IN
 * ("production", "default")`) that returns zero rows, so the widget renders
 * blank on the dashboard while showing fine in the edit screen (which applies
 * only the widget's own filter). Widgets WITHOUT their own environment filter
 * still receive the dashboard's global environment filter, preserving the
 * default-hide-`langfuse-*` behavior. The override is scoped to the
 * `environment` column only; every other dashboard-global filter still merges
 * as before. (LFE-14333; keeps LFE-7448 intact.)
 */
export function mergeWidgetAndDashboardFilters({
  view,
  widgetFilters,
  dashboardFilters,
}: {
  view: z.infer<typeof views>;
  widgetFilters: FilterState;
  dashboardFilters: FilterState;
}): FilterState {
  const mappedWidgetFilters = mapLegacyUiTableFilterToView(view, widgetFilters);
  const mappedDashboardFilters = mapLegacyUiTableFilterToView(
    view,
    dashboardFilters,
  );
  const widgetHasEnvironmentFilter = mappedWidgetFilters.some(
    (filter) => filter.column === "environment",
  );
  return [
    ...mappedWidgetFilters,
    ...(widgetHasEnvironmentFilter
      ? mappedDashboardFilters.filter(
          (filter) => filter.column !== "environment",
        )
      : mappedDashboardFilters),
  ];
}

/**
 * Formats a metric name for display, handling special cases like count_count -> Count
 */
export function formatMetricName(metricName: string): string {
  // Handle the count_count -> Count conversion
  const cleanedName = metricName === "count_count" ? "Count" : metricName;
  return startCase(cleanedName);
}

export type WidgetSuggestionTextKey =
  | "noMetrics"
  | "moreMetrics"
  | "name.metric"
  | "name.by"
  | "name.withView"
  | "description.multiMetric"
  | "description.count"
  | "description.metric"
  | "description.by"
  | "description.filteredByColumn"
  | "description.filteredByColumns"
  | "description.filteredByConditions";

export type WidgetSuggestionTextFormatter = (
  key: WidgetSuggestionTextKey,
  values?: Record<string, string | number>,
) => string;

export type WidgetSuggestionLabelFormatter = (
  kind: "aggregation" | "measure" | "dimension" | "view" | "filter",
  value: string,
) => string;

const defaultWidgetSuggestionLabelFormatter: WidgetSuggestionLabelFormatter = (
  kind,
  value,
) => (kind === "measure" ? formatMetricName(value) : startCase(value));

const defaultWidgetSuggestionTextFormatter: WidgetSuggestionTextFormatter = (
  key,
  values = {},
) => {
  switch (key) {
    case "noMetrics":
      return "No Metrics";
    case "moreMetrics":
      return `${values.metrics} + ${values.count} more`;
    case "name.metric":
      return `${values.aggregation} ${values.metric}`;
    case "name.by":
      return `${values.base} by ${values.dimension}`;
    case "name.withView":
      return `${values.base} (${values.view})`;
    case "description.multiMetric":
      return `Shows ${String(values.metrics).toLowerCase()} of ${values.view}`;
    case "description.count":
      return `Shows the count of ${values.view}`;
    case "description.metric":
      return `Shows the ${String(values.aggregation).toLowerCase()} ${String(values.metric).toLowerCase()} of ${values.view}`;
    case "description.by":
      return `${values.base} by ${String(values.dimension).toLowerCase()}`;
    case "description.filteredByColumn":
      return `${values.base}, filtered by ${values.column}`;
    case "description.filteredByColumns":
      return `${values.base}, filtered by ${values.firstColumn} and ${values.secondColumn}`;
    case "description.filteredByConditions":
      return `${values.base}, filtered by ${values.count} conditions`;
  }
};

/**
 * Formats multiple metric names for display, showing first 3 and "+ X more" if needed
 */
function formatMultipleMetricNames(
  metricNames: string[],
  formatText: WidgetSuggestionTextFormatter,
  formatLabel: WidgetSuggestionLabelFormatter,
): string {
  if (metricNames.length === 0) return formatText("noMetrics");
  if (metricNames.length === 1) return formatLabel("measure", metricNames[0]);

  const formattedNames = metricNames.map((metric) =>
    formatLabel("measure", metric),
  );

  if (metricNames.length <= 3) {
    return formattedNames.join(", ");
  }

  const firstThree = formattedNames.slice(0, 3).join(", ");
  const remaining = metricNames.length - 3;
  return formatText("moreMetrics", {
    metrics: firstThree,
    count: remaining,
  });
}

export function buildWidgetName({
  aggregation,
  measure,
  dimension,
  view,
  metrics,
  isMultiMetric = false,
  formatText = defaultWidgetSuggestionTextFormatter,
  formatLabel = defaultWidgetSuggestionLabelFormatter,
}: {
  aggregation: string;
  measure: string;
  dimension: string;
  view: string;
  metrics?: string[];
  isMultiMetric?: boolean;
  formatText?: WidgetSuggestionTextFormatter;
  formatLabel?: WidgetSuggestionLabelFormatter;
}) {
  let base: string;

  if (isMultiMetric && metrics && metrics.length > 0) {
    // Handle multi-metric scenarios (like pivot tables)
    const metricDisplay = formatMultipleMetricNames(
      metrics,
      formatText,
      formatLabel,
    );
    base = metricDisplay;
  } else {
    // Handle single metric scenarios (existing logic)
    const meas = formatLabel("measure", measure);
    if (measure.toLowerCase() === "count") {
      // For count measures, ignore aggregation and only show the measure
      base = meas;
    } else if (measure === "toolCalls" && aggregation.toLowerCase() === "sum") {
      // Summing the per-observation call count is simply "the number of tool
      // calls" — surface the meaning, not the aggregation mechanics.
      base = "Number of Tool Calls";
    } else {
      const agg = formatLabel("aggregation", aggregation.toLowerCase());
      base = formatText("name.metric", { aggregation: agg, metric: meas });
    }
  }

  if (dimension && dimension !== "none") {
    base = formatText("name.by", {
      base,
      dimension: formatLabel("dimension", dimension),
    });
  }
  return formatText("name.withView", {
    base,
    view: formatLabel("view", view),
  });
}

export function buildWidgetDescription({
  aggregation,
  measure,
  dimension,
  view,
  filters,
  metrics,
  isMultiMetric = false,
  formatText = defaultWidgetSuggestionTextFormatter,
  formatLabel = defaultWidgetSuggestionLabelFormatter,
}: {
  aggregation: string;
  measure: string;
  dimension: string;
  view: string;
  filters: FilterState;
  metrics?: string[];
  isMultiMetric?: boolean;
  formatText?: WidgetSuggestionTextFormatter;
  formatLabel?: WidgetSuggestionLabelFormatter;
}) {
  const viewLabel = formatLabel("view", view);
  let sentence: string;

  if (isMultiMetric && metrics && metrics.length > 0) {
    // Handle multi-metric scenarios
    const metricDisplay = formatMultipleMetricNames(
      metrics,
      formatText,
      formatLabel,
    );
    sentence = formatText("description.multiMetric", {
      metrics: metricDisplay,
      view: viewLabel,
    });
  } else {
    // Handle single metric scenarios (existing logic)
    const measLabel = formatLabel("measure", measure);

    if (measure.toLowerCase() === "count") {
      sentence = formatText("description.count", { view: viewLabel });
    } else if (measure === "toolCalls" && aggregation.toLowerCase() === "sum") {
      // Mirrors buildWidgetName: sum(toolCalls) is the number of tool calls.
      sentence = `Shows the number of tool calls of ${viewLabel}`;
    } else {
      const aggLabel = formatLabel("aggregation", aggregation.toLowerCase());
      sentence = formatText("description.metric", {
        aggregation: aggLabel,
        metric: measLabel,
        view: viewLabel,
      });
    }
  }

  // Dimension clause
  if (dimension && dimension !== "none") {
    sentence = formatText("description.by", {
      base: sentence,
      dimension: formatLabel("dimension", dimension),
    });
  }

  // Filters clause
  if (filters && filters.length > 0) {
    if (filters.length <= 2) {
      const columns = filters.map((filter) =>
        formatLabel("filter", filter.column),
      );
      sentence =
        columns.length === 1
          ? formatText("description.filteredByColumn", {
              base: sentence,
              column: columns[0],
            })
          : formatText("description.filteredByColumns", {
              base: sentence,
              firstColumn: columns[0],
              secondColumn: columns[1],
            });
    } else {
      sentence = formatText("description.filteredByConditions", {
        base: sentence,
        count: filters.length,
      });
    }
  }

  return sentence;
}

/**
 * Returns the default view for the new widget form.
 * When v4 beta is enabled, defaults to "observations" because "traces"
 * remains excluded from the public `viewsV2` API enum. Existing trace widgets
 * are still supported by the internal events-backed v2 query declaration.
 */
export function getDefaultView(isV4: boolean): "traces" | "observations" {
  return isV4 ? "observations" : "traces";
}

/**
 * SSE progress is only enabled on the v4 beta dashboard query path.
 */
export function shouldUseWidgetSSE({
  isV4Enabled,
  version,
}: {
  isV4Enabled: boolean;
  version: "v1" | "v2";
}): boolean {
  return isV4Enabled && version === "v2";
}

const widgetUnitLabels: Record<string, string> = {
  USD: "USD",
  millisecond: "Duration",
  tokens: "Tokens",
  "tokens/s": "Tokens/s",
  traces: "Traces",
  observations: "Observations",
  scores: "Scores",
  users: "Users",
  sessions: "Sessions",
  tools: "Tools",
  calls: "Calls",
};

/**
 * Decides what a widget's time-series chart shows for a bucket its metric has
 * no data point in, from the metric's aggregation: counting and additive
 * aggregations (count, uniq, sum) have an honest `0` — nothing happened —
 * while avg/min/max/percentiles have no honest value and must render a gap
 * instead of a fabricated number. (LFE-10694)
 */
export function getWidgetMissingBucketValue(agg: string): MissingBucketValue {
  return agg === "count" || agg === "uniq" || agg === "sum" ? "zero" : "gap";
}

export function getWidgetMetricPresentation(params: {
  metric: { measure: string; agg: string };
  view: string;
  version: ViewVersion;
}): {
  label: string;
  metricFormatter?: MetricFormatterFunction;
} {
  const viewDeclaration = getViewDeclaration(
    views.parse(params.view),
    params.version,
  );

  const measureDefinition = viewDeclaration.measures[params.metric.measure];

  const usesCountStyleAggregation =
    params.metric.agg === "count" || params.metric.agg === "uniq";

  if (
    !usesCountStyleAggregation &&
    (measureDefinition?.unit === "USD" ||
      measureDefinition?.unit === "millisecond")
  ) {
    return {
      label: widgetUnitLabels[measureDefinition.unit],
      metricFormatter: (value, options) =>
        formatMetric(value, { ...options, unit: measureDefinition.unit }),
    };
  }

  if (!usesCountStyleAggregation && measureDefinition?.unit) {
    return {
      label:
        widgetUnitLabels[measureDefinition.unit] ??
        formatMetricName(measureDefinition.unit),
    };
  }

  return {
    label: formatMetricName(`${params.metric.agg}_${params.metric.measure}`),
  };
}
