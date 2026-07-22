import { useMemo, useState, useCallback } from "react";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { type OrderByState } from "@langfuse/shared";
import {
  type QueryType,
  type ViewVersion,
  getResultUnit,
} from "@langfuse/shared/query";
import { useScheduledDashboardExecuteQuery } from "@/src/hooks/useDashboardQueryScheduler";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { ChartLoadingState } from "@/src/features/widgets/chart-library/ChartLoadingState";
import {
  getChartLoadingProgress,
  getChartLoadingStateProps,
} from "@/src/features/widgets/chart-library/chartLoadingStateUtils";
import {
  formatMetricName,
  shouldUseWidgetSSE,
  getWidgetMetricPresentation,
  getWidgetMissingBucketValue,
  type WidgetChartConfig,
} from "@/src/features/widgets/utils";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { cn } from "@/src/utils/tailwind";

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

export interface WidgetContentProps {
  projectId: string;
  query: QueryType;
  version: ViewVersion;
  chartType: DashboardWidgetChartType;
  chartConfig: WidgetChartConfig;
  metrics: WidgetMetricConfig[];
  dimensions: WidgetDimensionConfig[];
  view: string;
  /**
   * External loading state - when true, shows loading overlay even if query is complete.
   * Useful when parent component needs to load data before the widget can be meaningful.
   */
  isExternalLoading?: boolean;
  /**
   * Unique ID for query scheduling.
   */
  schedulerId: string;
  /**
   * Layout hint for loading state display. Affects spacing and text size.
   */
  layoutHint?: "default" | "compact" | "tight";
  /**
   * Pivot table sort state (only used for PIVOT_TABLE chart type)
   */
  sortState?: OrderByState | null;
  /**
   * Callback when pivot table sort changes
   */
  onSortChange?: (sort: OrderByState | null) => void;
  /**
   * Additional class names for the container
   */
  className?: string;
  /**
   * Optional presentation-only labels for entity_dimension values.
   */
  entityDimensionLabelMap?: Record<string, string>;
  /**
   * Hide x-axis tick labels on a categorical (entity-name) axis; the full name
   * stays in the hover tooltip. Off by default. Opt in on entity-dimension
   * charts (experiments) whose long names clutter the axis.
   */
  hideXAxisLabels?: boolean;
}

export interface WidgetHeaderProps {
  title: string;
  description?: string;
  /**
   * Action buttons to render on the right side of the header
   */
  actions?: React.ReactNode;
  className?: string;
}

export interface WidgetWrapperProps {
  children: React.ReactNode;
  className?: string;
}

// ============================================================================
// Components
// ============================================================================

/**
 * Simple wrapper providing consistent widget styling (border, padding, background).
 */
export function WidgetWrapper({ children, className }: WidgetWrapperProps) {
  return (
    <div
      className={cn(
        "bg-background group flex h-full w-full flex-col overflow-hidden rounded-lg border p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Widget header with title, description, and optional action buttons.
 */
export function WidgetHeader({
  title,
  description,
  actions,
  className,
}: WidgetHeaderProps) {
  return (
    <div className={cn("mb-4", className)}>
      <div className="flex items-center justify-between">
        <span className="truncate font-bold" title={title}>
          {title}
        </span>
        {actions && <div className="flex space-x-2">{actions}</div>}
      </div>
      {description && (
        <div
          className="text-muted-foreground truncate text-sm"
          title={description}
        >
          {description}
        </div>
      )}
    </div>
  );
}

const getXAxisValue = (
  item: Record<string, unknown>,
  entityDimensionLabelMap?: Record<string, string>,
) => {
  const entityDimensionValue = String(item["entity_dimension"]);
  const entityDimensionLabel = entityDimensionLabelMap?.[entityDimensionValue];
  return entityDimensionLabel && entityDimensionLabel.length > 0
    ? entityDimensionLabel
    : entityDimensionValue;
};

/**
 * Core widget content: executes query, transforms data, renders chart with loading states.
 *
 * This component handles:
 * - Query execution via useScheduledDashboardExecuteQuery
 * - Data transformation for chart consumption (time_dimension, entity_dimension, dimension, metric)
 * - Chart rendering with the appropriate chart type
 * - Loading and error states
 *
 * For pivot tables, pass sortState and onSortChange to enable sorting.
 */
export function WidgetContent({
  projectId,
  query,
  version,
  chartType,
  chartConfig,
  metrics,
  dimensions,
  view,
  // equals widget is pending
  isExternalLoading = false,
  schedulerId,
  layoutHint = "default",
  sortState,
  onSortChange,
  className,
  entityDimensionLabelMap,
  hideXAxisLabels,
}: WidgetContentProps) {
  const { isBetaEnabled } = useV4Beta();
  const [retryCount, setRetryCount] = useState(0);

  const handleRetry = useCallback(() => {
    setRetryCount((current) => current + 1);
  }, []);

  // Execute the query
  const queryResult = useScheduledDashboardExecuteQuery(
    {
      projectId,
      version,
      query,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      queryId: schedulerId,
      meta: {
        silentHttpCodes: [422],
      },
      refreshKey: retryCount,
      useSSE: shouldUseWidgetSSE({
        isV4Enabled: isBetaEnabled,
        version,
      }),
      enabled: !isExternalLoading,
    },
  );

  // Transform data for chart consumption
  const transformedData = useMemo(() => {
    if (!queryResult.data) {
      return [];
    }

    const mapped = queryResult.data.map((item: Record<string, unknown>) => {
      if (chartType === "PIVOT_TABLE") {
        // For pivot tables, preserve all raw data fields
        const timeDimension = item["time_dimension"];
        return {
          dimension:
            dimensions.length > 0
              ? (dimensions[0]?.field ?? "dimension")
              : "dimension",
          metric: 0,
          time_dimension:
            typeof timeDimension === "string"
              ? timeDimension
              : String(timeDimension ?? "n/a"),
          ...item,
        };
      }

      // Regular chart processing
      const metric = metrics.slice().shift() ?? {
        measure: "count",
        agg: "count",
      };
      const metricField = `${metric.agg}_${metric.measure}`;
      const metricValue = item[metricField];

      const dimensionField = dimensions.slice().shift()?.field ?? "none";

      // Handle x-axis: prefer entity_dimension, then time_dimension
      let xAxisValue: string | undefined;
      if (item["entity_dimension"] !== undefined) {
        xAxisValue = getXAxisValue(item, entityDimensionLabelMap);
      } else if (item["time_dimension"] !== undefined) {
        xAxisValue = String(item["time_dimension"]);
      }

      const isTimeSeries = isTimeSeriesChart(chartType);
      const dimensionValue = item[dimensionField];

      // A gap-filled empty bucket arrives as a row with no dimension and the
      // metric column's type default: NULL for nullable aggregations
      // (avg/percentiles), 0 for non-nullable ones (count/uniq/sum). Keep it
      // as a pure bucket marker (holds the spot on the x axis) instead of
      // inventing an "n/a" series. The 0 form is only treated as filler for
      // additive metrics, where the marker is lossless (prepareDenseSeries
      // re-derives the honest 0 for any series that exists); a real
      // dimension-less avg/percentile 0 stays a visible data point. (LFE-10694)
      const isFillerMetricValue =
        metricValue == null ||
        (getWidgetMissingBucketValue(metric.agg) === "zero" &&
          Number(metricValue) === 0);
      if (
        isTimeSeries &&
        (dimensionValue === null || dimensionValue === "") &&
        isFillerMetricValue
      ) {
        return {
          time_dimension: xAxisValue,
          dimension: undefined,
          metric: null,
        };
      }

      // Handle series dimension (for legend)
      let seriesDimension: string;
      if (dimensionValue !== undefined) {
        const val = dimensionValue;
        // Empty first: "" is a string, so the order matters. (LFE-10694)
        if (val === null || val === undefined || val === "") {
          seriesDimension = "n/a";
        } else if (typeof val === "string") {
          seriesDimension = val;
        } else if (Array.isArray(val)) {
          seriesDimension = val.join(", ");
        } else {
          seriesDimension = String(val);
        }
      } else {
        seriesDimension = formatMetricName(metricField);
      }

      return {
        // time_dimension is used as x-axis for charts (works for both time and entity dimensions)
        time_dimension: xAxisValue,
        dimension: seriesDimension,
        metric: Array.isArray(metricValue)
          ? metricValue
          : // On a time series a missing value stays null — the chart renders
            // it by the metric's missing-bucket semantics instead of a fake 0.
            isTimeSeries && metricValue == null
            ? null
            : Number(metricValue || 0),
      };
    });

    // Entity-dimension charts have no meaningful query-side order (the server
    // falls back to first-metric DESC, which differs per chart). Order the
    // x-axis to match the experiments table order provided via
    // entityDimensionLabelMap so the same entity lines up across chart slots.
    if (
      chartType !== "PIVOT_TABLE" &&
      entityDimensionLabelMap &&
      Object.keys(entityDimensionLabelMap).length > 0
    ) {
      const order = new Map<string, number>();
      Object.entries(entityDimensionLabelMap).forEach(([id, name], index) => {
        order.set(id, index);
        order.set(name, index);
      });
      return mapped
        .slice()
        .sort(
          (a, b) =>
            (order.get(b.time_dimension ?? "") ?? Number.MAX_SAFE_INTEGER) -
            (order.get(a.time_dimension ?? "") ?? Number.MAX_SAFE_INTEGER),
        );
    }

    return mapped;
  }, [
    queryResult.data,
    chartType,
    metrics,
    dimensions,
    entityDimensionLabelMap,
  ]);

  // Chart presentation (label and formatter)
  const chartPresentation = useMemo(() => {
    if (chartType === "PIVOT_TABLE" || metrics.length === 0) {
      return undefined;
    }

    const metric = metrics[0];
    return getWidgetMetricPresentation({
      metric,
      view,
      version,
    });
  }, [chartType, metrics, view, version]);

  // Loading state
  const chartLoadingState = getChartLoadingStateProps({
    isPending: queryResult.isPending,
    isError: queryResult.isError,
    errorMessage: queryResult.error,
  });

  const usesBackendProgress = shouldUseWidgetSSE({
    isV4Enabled: isBetaEnabled,
    version,
  });

  const loadingProgress = getChartLoadingProgress({
    isPending: queryResult.isPending,
    progress: queryResult.progress,
    useBackendProgress: usesBackendProgress,
  });

  // Determine row limit
  const effectiveRowLimit = useMemo(() => {
    if (
      chartType === "LINE_TIME_SERIES" ||
      chartType === "BAR_TIME_SERIES" ||
      chartType === "AREA_TIME_SERIES"
    ) {
      return 100;
    }
    return chartConfig.row_limit ?? 100;
  }, [chartType, chartConfig.row_limit]);

  // Build chart config with units
  const fullChartConfig = useMemo(() => {
    const baseConfig = { ...chartConfig };

    if (chartType === "PIVOT_TABLE") {
      return {
        ...baseConfig,
        dimensions: dimensions.map((dim) => dim.field),
        metrics: metrics.map((m) => `${m.agg}_${m.measure}`),
        units: metrics.map((m) =>
          getResultUnit(view, m.measure, m.agg, version),
        ),
      };
    }

    if (metrics.length > 0) {
      return {
        ...baseConfig,
        unit: getResultUnit(view, metrics[0].measure, metrics[0].agg, version),
      };
    }

    return baseConfig;
  }, [chartConfig, chartType, dimensions, metrics, view, version]);

  if (isExternalLoading) {
    return (
      <div className="bg-background flex items-center justify-center rounded-lg border p-4">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className={cn("relative min-h-0 flex-1", className)}>
      <Chart
        chartType={chartType}
        data={transformedData}
        config={
          chartPresentation
            ? { metric: { label: chartPresentation.label } }
            : undefined
        }
        rowLimit={effectiveRowLimit}
        chartConfig={fullChartConfig}
        sortState={chartType === "PIVOT_TABLE" ? sortState : undefined}
        onSortChange={chartType === "PIVOT_TABLE" ? onSortChange : undefined}
        isLoading={queryResult.isPending || isExternalLoading}
        metricFormatter={chartPresentation?.metricFormatter}
        missingValue={getWidgetMissingBucketValue(metrics[0]?.agg ?? "count")}
        hideXAxisLabels={hideXAxisLabels}
      />
      <ChartLoadingState
        isLoading={chartLoadingState.isLoading}
        showSpinner={chartLoadingState.showSpinner}
        showHintImmediately={chartLoadingState.showHintImmediately}
        hintText={chartLoadingState.hintText}
        onRetry={queryResult.isError ? handleRetry : undefined}
        progress={loadingProgress}
        layout={layoutHint}
        className="bg-background/80 absolute inset-0 z-20 backdrop-blur-xs"
      />
    </div>
  );
}
