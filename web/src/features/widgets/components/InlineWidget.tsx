import { useMemo, useState, useCallback } from "react";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { type OrderByState } from "@langfuse/shared";
import {
  type QueryType,
  type ViewVersion,
  getResultUnit,
} from "@langfuse/shared/query";
import { useRouter } from "next/router";
import { useScheduledDashboardExecuteQuery } from "@/src/hooks/useDashboardQueryScheduler";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { ChartLoadingState } from "@/src/features/widgets/chart-library/ChartLoadingState";
import {
  getChartLoadingProgress,
  getChartLoadingStateProps,
} from "@/src/features/widgets/chart-library/chartLoadingStateUtils";
import {
  shouldUseWidgetSSE,
  getWidgetMetricPresentation,
  type WidgetChartConfig,
} from "@/src/features/widgets/utils";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { cn } from "@/src/utils/tailwind";
import { prepareWidgetChartData } from "@/src/features/widgets/utils/prepareChartData";

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
        <span className="truncate font-medium" title={title}>
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
}: WidgetContentProps) {
  const router = useRouter();
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

    return prepareWidgetChartData({
      rows: queryResult.data as Array<Record<string, unknown>>,
      projectId,
      query,
      version,
      chartType,
      metrics,
      dimensions,
      isV4Enabled: isBetaEnabled,
      entityDimensionLabelMap,
    });
  }, [
    queryResult.data,
    projectId,
    query,
    version,
    chartType,
    metrics,
    dimensions,
    isBetaEnabled,
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

  const handleDrilldown = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router],
  );

  if (isExternalLoading) {
    return (
      <div
        className={`bg-background flex items-center justify-center rounded-lg border p-4`}
      >
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
        onDrilldown={handleDrilldown}
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
