import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/src/utils/api";
import {
  type views,
  type metricAggregations,
  type QueryType,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";
import { type z } from "zod";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { type FilterState, type OrderByState } from "@langfuse/shared";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import {
  PencilIcon,
  TrashIcon,
  CopyIcon,
  GripVerticalIcon,
} from "lucide-react";
import { useRouter } from "next/router";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { DownloadButton } from "@/src/features/widgets/chart-library/DownloadButton";
import {
  formatMetricName,
  shouldUseWidgetSSE,
} from "@/src/features/widgets/utils";
import { ChartLoadingState } from "@/src/features/widgets/chart-library/ChartLoadingState";
import {
  getChartLoadingProgress,
  getChartLoadingStateProps,
} from "@/src/features/widgets/chart-library/chartLoadingStateUtils";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { type ViewVersion } from "@/src/features/query";
import { useScheduledDashboardExecuteQuery } from "@/src/hooks/useDashboardQueryScheduler";
import {
  validateQuery,
  toQueryChartConfig,
  isV2BreakdownChart,
  buildWidgetOrderBy,
} from "@/src/features/query/validateQuery";

export interface WidgetPlacement {
  id: string;
  widgetId: string;
  x: number;
  y: number;
  x_size: number;
  y_size: number;
  type: "widget";
}

export function DashboardWidget({
  projectId,
  dashboardId,
  placement,
  dateRange,
  filterState,
  onDeleteWidget,
  dashboardOwner,
  schedulerId,
}: {
  projectId: string;
  dashboardId: string;
  placement: WidgetPlacement;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
  onDeleteWidget: (tileId: string) => void;
  dashboardOwner: "LANGFUSE" | "PROJECT";
  schedulerId?: string;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const { isBetaEnabled } = useV4Beta();
  const widget = api.dashboardWidgets.get.useQuery(
    {
      widgetId: placement.widgetId,
      projectId,
    },
    {
      enabled: Boolean(projectId),
    },
  );
  // If widget requires v2 features (minVersion >= 2), must use v2.
  // Otherwise follow the beta toggle.
  const metricsVersion: ViewVersion =
    (widget.data?.minVersion ?? 1) >= 2 || isBetaEnabled ? "v2" : "v1";
  const hasCUDAccess =
    useHasProjectAccess({ projectId, scope: "dashboards:CUD" }) &&
    dashboardOwner !== "LANGFUSE";

  // Initialize sort state for pivot tables
  const defaultSort =
    widget.data?.chartConfig.type === "PIVOT_TABLE"
      ? widget.data?.chartConfig.defaultSort
      : undefined;

  const [sortState, setSortState] = useState<OrderByState | null>(() => {
    return defaultSort || null;
  });
  const [retryCount, setRetryCount] = useState(0);

  // Apply defaultSort when it becomes available (after widget data loads)
  // but only if user hasn't interacted yet
  useEffect(() => {
    if (defaultSort && sortState === null) {
      setSortState(defaultSort);
    }
  }, [defaultSort, sortState]);

  const updateSort = useCallback((newSort: OrderByState | null) => {
    setSortState(newSort);
  }, []);

  const widgetQuery: QueryType = useMemo(() => {
    const fromTimestamp = dateRange
      ? dateRange.from
      : new Date(new Date().getTime() - 1000);
    const toTimestamp = dateRange ? dateRange.to : new Date();

    const isTimeSeries = isTimeSeriesChart(
      widget.data?.chartType ?? "LINE_TIME_SERIES",
    );
    const hasDimension = (widget.data?.dimensions ?? []).length > 0;
    const chartType = widget.data?.chartConfig.type ?? "LINE_TIME_SERIES";
    const needsTopN = isV2BreakdownChart({
      version: metricsVersion,
      hasDimension,
      isTimeSeries,
      chartType,
    });

    const firstMetric = widget.data?.metrics[0];
    const orderBy = buildWidgetOrderBy({
      chartType,
      sortState,
      needsTopN,
      firstMetric: firstMetric
        ? { aggregation: firstMetric.agg, measure: firstMetric.measure }
        : undefined,
    });

    // Only query-engine fields — rendering fields (defaultSort, show_value_labels)
    // stay on widget.data.chartConfig for the Chart component
    const chartConfig = widget.data?.chartConfig
      ? toQueryChartConfig(widget.data.chartConfig, {
          defaultRowLimit: needsTopN ? 100 : undefined,
        })
      : { type: chartType };

    return {
      view: (widget.data?.view as z.infer<typeof views>) ?? "traces",
      dimensions: widget.data?.dimensions ?? [],
      metrics:
        widget.data?.metrics.map((metric) => ({
          measure: metric.measure,
          aggregation: metric.agg as z.infer<typeof metricAggregations>,
        })) ?? [],
      filters: [
        ...(widget.data?.filters ?? []),
        ...mapLegacyUiTableFilterToView(
          (widget.data?.view as z.infer<typeof views>) ?? "traces",
          filterState,
        ),
      ],
      timeDimension: isTimeSeries ? { granularity: "auto" as const } : null,
      fromTimestamp: fromTimestamp.toISOString(),
      toTimestamp: toTimestamp.toISOString(),
      orderBy,
      chartConfig,
    };
  }, [widget.data, filterState, dateRange, sortState, metricsVersion]);

  const queryValidation = useMemo(
    () =>
      widget.data
        ? validateQuery(widgetQuery, metricsVersion)
        : ({ valid: true } as const),
    [widgetQuery, metricsVersion, widget.data],
  );
  const queryResult = useScheduledDashboardExecuteQuery(
    {
      projectId,
      version: metricsVersion,
      query: widgetQuery,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      queryId: `${schedulerId ?? `dashboard-widget:${placement.id}`}:execute`,
      meta: {
        silentHttpCodes: [422],
      },
      refreshKey: retryCount,
      useSSE: shouldUseWidgetSSE({
        isV4Enabled: isBetaEnabled,
        version: metricsVersion,
      }),
      enabled:
        !widget.isPending && Boolean(widget.data) && queryValidation.valid,
    },
  );

  const chartLoadingState = getChartLoadingStateProps({
    isPending: queryResult.isPending,
    isError: queryResult.isError,
    errorMessage: queryResult.error,
  });
  const usesBackendProgress = shouldUseWidgetSSE({
    isV4Enabled: isBetaEnabled,
    version: metricsVersion,
  });
  const loadingStateLayout =
    placement.y_size <= 2
      ? "tight"
      : placement.x_size <= 4
        ? "compact"
        : "default";
  const loadingProgress = getChartLoadingProgress({
    isPending: queryResult.isPending,
    progress: queryResult.progress,
    useBackendProgress: usesBackendProgress,
  });
  const handleRetry = useCallback(() => {
    setRetryCount((current) => current + 1);
  }, []);

  const transformedData = useMemo(() => {
    if (!widget.data || !queryResult.data) {
      return [];
    }
    return queryResult.data.map((item: any) => {
      if (widget.data.chartType === "PIVOT_TABLE") {
        // For pivot tables, preserve all raw data fields without any transformation
        // The PivotTable component will extract the appropriate metric fields
        // using the metric field names passed via chartConfig
        return {
          dimension:
            widget.data.dimensions.length > 0
              ? (widget.data.dimensions[0]?.field ?? "dimension")
              : "dimension", // Fallback for compatibility
          metric: 0, // Placeholder - not used for pivot tables
          time_dimension: item["time_dimension"],
          // Include all original query fields for pivot table processing
          ...item,
        };
      }

      // Regular chart processing for non-pivot tables
      const metric = widget.data.metrics.slice().shift() ?? {
        measure: "count",
        agg: "count",
      };
      const metricField = `${metric.agg}_${metric.measure}`;
      const metricValue = item[metricField];

      const dimensionField =
        widget.data.dimensions.slice().shift()?.field ?? "none";
      return {
        dimension:
          item[dimensionField] !== undefined
            ? (() => {
                const val = item[dimensionField];
                if (typeof val === "string") return val;
                if (val === null || val === undefined || val === "")
                  return "n/a";
                if (Array.isArray(val)) return val.join(", ");
                // Objects / numbers / booleans are stringified to avoid React key issues
                return String(val);
              })()
            : formatMetricName(metricField),
        metric: Array.isArray(metricValue)
          ? metricValue
          : Number(metricValue || 0),
        time_dimension: item["time_dimension"],
      };
    });
  }, [queryResult.data, widget.data]);

  const handleEdit = () => {
    router.push(
      `/project/${projectId}/widgets/${placement.widgetId}?dashboardId=${dashboardId}`,
    );
  };

  const copyMutation = api.dashboardWidgets.copyToProject.useMutation({
    onSuccess: (data) => {
      utils.dashboard.getDashboard.invalidate().then(() => {
        router.push(
          `/project/${projectId}/widgets/${data.widgetId}?dashboardId=${dashboardId}`,
        );
      });
    },
    onError: (e) => {
      showErrorToast("Failed to clone widget", e.message);
    },
  });
  const handleCopy = () => {
    copyMutation.mutate({
      projectId,
      widgetId: placement.widgetId,
      dashboardId: router.query.dashboardId as string,
      placementId: placement.id,
    });
  };

  const handleDelete = () => {
    if (onDeleteWidget && confirm("Please confirm deletion")) {
      onDeleteWidget(placement.id);
    }
  };

  if (widget.isPending) {
    return (
      <div
        className={`bg-background flex items-center justify-center rounded-lg border p-4`}
      >
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!widget.data) {
    return (
      <div
        className={`bg-background flex items-center justify-center rounded-lg border p-4`}
      >
        <div className="text-muted-foreground">Widget not found</div>
      </div>
    );
  }

  return (
    <div
      className={`bg-background group flex h-full w-full flex-col overflow-hidden rounded-lg border p-4`}
    >
      <div className="flex items-center justify-between">
        <span className="truncate font-medium" title={widget.data.name}>
          {widget.data.name}{" "}
          {dashboardOwner === "PROJECT" && widget.data.owner === "LANGFUSE"
            ? " ( 🪢 )"
            : null}
        </span>
        <div className="flex space-x-2">
          {hasCUDAccess && (
            <>
              <GripVerticalIcon
                size={16}
                className="drag-handle text-muted-foreground hover:text-foreground hidden cursor-grab active:cursor-grabbing lg:group-hover:block"
              />
              {widget.data.owner === "PROJECT" ? (
                <button
                  onClick={handleEdit}
                  className="text-muted-foreground hover:text-foreground hidden group-hover:block"
                  aria-label="Edit widget"
                >
                  <PencilIcon size={16} />
                </button>
              ) : widget.data.owner === "LANGFUSE" ? (
                <button
                  onClick={handleCopy}
                  className="text-muted-foreground hover:text-foreground hidden group-hover:block"
                  aria-label="Copy widget"
                >
                  <CopyIcon size={16} />
                </button>
              ) : null}
              <button
                onClick={handleDelete}
                className="text-muted-foreground hover:text-destructive hidden group-hover:block"
                aria-label="Delete widget"
              >
                <TrashIcon size={16} />
              </button>
            </>
          )}
          {/* Download button is available once chart data has loaded */}
          {!queryResult.isPending ? (
            <DownloadButton
              data={transformedData}
              fileName={widget.data.name}
              className="hidden group-hover:block"
            />
          ) : null}
        </div>
      </div>
      <div
        className="text-muted-foreground mb-4 truncate text-sm"
        title={widget.data.description}
      >
        {widget.data.description}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {!queryValidation.valid ? (
          <div className="relative min-h-0 flex-1">
            <ChartLoadingState
              isLoading={true}
              showSpinner={false}
              showHintImmediately={true}
              hintText={queryValidation.reason}
              layout={loadingStateLayout}
              className="bg-background/80 absolute inset-0 z-20 backdrop-blur-xs"
            />
          </div>
        ) : (
          <div className="relative min-h-0 flex-1">
            <Chart
              chartType={widget.data.chartType}
              data={transformedData}
              rowLimit={
                widget.data.chartConfig.type === "LINE_TIME_SERIES" ||
                widget.data.chartConfig.type === "BAR_TIME_SERIES" ||
                widget.data.chartConfig.type === "AREA_TIME_SERIES"
                  ? 100
                  : (widget.data.chartConfig.row_limit ?? 100)
              }
              chartConfig={{
                ...widget.data.chartConfig,
                // For PIVOT_TABLE, enhance chartConfig with dimensions and metric field names
                ...(widget.data.chartType === "PIVOT_TABLE" && {
                  dimensions: widget.data.dimensions.map((dim) => dim.field),
                  metrics: widget.data.metrics.map(
                    (metric) => `${metric.agg}_${metric.measure}`,
                  ),
                }),
              }}
              sortState={
                widget.data.chartType === "PIVOT_TABLE" ? sortState : undefined
              }
              onSortChange={
                widget.data.chartType === "PIVOT_TABLE" ? updateSort : undefined
              }
              isLoading={queryResult.isPending}
            />
            <ChartLoadingState
              isLoading={chartLoadingState.isLoading}
              showSpinner={chartLoadingState.showSpinner}
              showHintImmediately={chartLoadingState.showHintImmediately}
              hintText={chartLoadingState.hintText}
              onRetry={queryResult.isError ? handleRetry : undefined}
              progress={loadingProgress}
              layout={loadingStateLayout}
              className="bg-background/80 absolute inset-0 z-20 backdrop-blur-xs"
            />
          </div>
        )}
      </div>
    </div>
  );
}
