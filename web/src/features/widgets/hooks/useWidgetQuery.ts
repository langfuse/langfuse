import { useMemo } from "react";
import { type z } from "zod";
import { type FilterState } from "@langfuse/shared";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import {
  type QueryType,
  type ViewVersion,
  type views,
  type metricAggregations,
  requiresV2,
  validateQuery,
  toQueryChartConfig,
  isV2BreakdownChart,
  buildWidgetOrderBy,
  type QueryValidationResult,
} from "@langfuse/shared/query";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";

// ============================================================================
// Types
// ============================================================================

export interface WidgetMetricConfig {
  measure: string;
  agg: string;
}

export interface WidgetDimensionConfig {
  field: string;
}

export interface WidgetChartConfig {
  type: DashboardWidgetChartType;
  row_limit?: number;
  bins?: number;
  defaultSort?: {
    column: string;
    order: "ASC" | "DESC";
  };
}

/**
 * Widget configuration - the shape of data stored in DB or passed programmatically.
 */
export interface WidgetConfig {
  view: z.infer<typeof views>;
  dimensions: WidgetDimensionConfig[];
  metrics: WidgetMetricConfig[];
  filters: FilterState;
  chartType: DashboardWidgetChartType;
  chartConfig: WidgetChartConfig;
  /**
   * Minimum version required by this widget config.
   * When >= 2, forces v2 regardless of beta toggle.
   */
  minVersion?: number;
}

export interface UseWidgetQueryParams {
  widgetConfig: WidgetConfig;
  dateRange: { from: Date; to: Date } | undefined;
  /**
   * Additional filters from parent context (e.g., dashboard-level filters).
   * These are merged with widget filters.
   */
  filterState?: FilterState;
  /**
   * Sort state for pivot tables.
   */
  sortState?: { column: string; order: string } | null;
}

export interface UseWidgetQueryResult {
  query: QueryType;
  version: ViewVersion;
  validation: QueryValidationResult;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook that builds a QueryType from widget configuration.
 *
 * Handles:
 * - Version computation (v1 vs v2) based on widget config and beta toggle
 * - Query building with proper time dimension, order by, and chart config
 * - Filter merging and mapping from UI labels to view field names
 * - Query validation for high cardinality dimensions
 *
 * @example
 * ```tsx
 * const { query, version, validation } = useWidgetQuery({
 *   widgetConfig: widget.data,
 *   dateRange,
 *   filterState: dashboardFilters,
 *   sortState,
 * });
 *
 * if (!validation.valid) {
 *   return <Error message={validation.reason} />;
 * }
 *
 * return <WidgetContent query={query} version={version} ... />;
 * ```
 */
export function useWidgetQuery({
  widgetConfig,
  dateRange,
  filterState = [],
  sortState = null,
}: UseWidgetQueryParams): UseWidgetQueryResult {
  const { isBetaEnabled } = useV4Beta();

  // Compute version based on widget requirements and beta toggle
  const version: ViewVersion = useMemo(() => {
    const widgetRequiresV2 = requiresV2({
      view: widgetConfig.view,
      dimensions: widgetConfig.dimensions,
      measures: widgetConfig.metrics.map((m) => ({ measure: m.measure })),
      filters: widgetConfig.filters,
    });

    // If widget requires v2 features (minVersion >= 2), must use v2.
    // Otherwise follow the beta toggle (except for traces view which has no v2).
    if (widgetRequiresV2 || (widgetConfig.minVersion ?? 1) >= 2) {
      return "v2";
    }

    if (isBetaEnabled && widgetConfig.view !== "traces") {
      return "v2";
    }

    return "v1";
  }, [widgetConfig, isBetaEnabled]);

  // Build the query
  const query: QueryType = useMemo(() => {
    const fromTimestamp = dateRange
      ? dateRange.from
      : new Date(Date.now() - 1000);
    const toTimestamp = dateRange ? dateRange.to : new Date();

    const isTimeSeries = isTimeSeriesChart(widgetConfig.chartType);
    const hasDimension = widgetConfig.dimensions.length > 0;
    const chartType = widgetConfig.chartConfig.type;

    // Check if this is a v2 breakdown chart that needs top-N enforcement
    const needsTopN = isV2BreakdownChart({
      version,
      hasDimension,
      isTimeSeries,
      chartType,
    });

    // Build order by clause
    const firstMetric = widgetConfig.metrics[0];
    const orderBy = buildWidgetOrderBy({
      chartType,
      sortState,
      needsTopN,
      firstMetric: firstMetric
        ? { aggregation: firstMetric.agg, measure: firstMetric.measure }
        : undefined,
    });

    // Build chart config (strip rendering-only fields, add defaults)
    const queryChartConfig = toQueryChartConfig(widgetConfig.chartConfig, {
      defaultRowLimit: needsTopN ? 100 : undefined,
    });

    // Merge and map filters
    const mappedWidgetFilters = mapLegacyUiTableFilterToView(
      widgetConfig.view,
      widgetConfig.filters,
    );
    const mappedDashboardFilters = mapLegacyUiTableFilterToView(
      widgetConfig.view,
      filterState,
    );

    return {
      view: widgetConfig.view,
      dimensions: widgetConfig.dimensions,
      metrics: widgetConfig.metrics.map((metric) => ({
        measure: metric.measure,
        aggregation: metric.agg as z.infer<typeof metricAggregations>,
      })),
      filters: [...mappedWidgetFilters, ...mappedDashboardFilters],
      timeDimension: isTimeSeries ? { granularity: "auto" as const } : null,
      fromTimestamp: fromTimestamp.toISOString(),
      toTimestamp: toTimestamp.toISOString(),
      orderBy,
      chartConfig: queryChartConfig,
    };
  }, [widgetConfig, dateRange, filterState, sortState, version]);

  // Validate the query
  const validation = useMemo(
    () => validateQuery(query, version),
    [query, version],
  );

  return { query, version, validation };
}
