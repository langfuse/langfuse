import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/src/utils/api";
import {
  buildWidgetOrderBy,
  getResultUnit,
  isV2BreakdownChart,
  requiresV2,
  toQueryChartConfig,
  validateQuery,
  type QueryType,
  type ViewVersion,
  type metricAggregations,
  type views,
} from "@langfuse/shared/query";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { type z } from "zod";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { type FilterState, type OrderByState } from "@langfuse/shared";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import {
  PencilIcon,
  TrashIcon,
  GripVerticalIcon,
  MoreVerticalIcon,
  CopyIcon,
  ClipboardPasteIcon,
  CopyPlusIcon,
  FileJsonIcon,
  DownloadIcon,
  TableIcon,
} from "lucide-react";
import { useRouter } from "next/router";
import {
  buildTableFilterHref,
  buildViewAsTableHint,
} from "@/src/features/dashboard/lib/buildTableFilterHref";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { downloadChartDataCsv } from "@/src/features/widgets/chart-library/downloadChartDataCsv";
import {
  buildWidgetExport,
  downloadWidgetJson,
  type WidgetExportSource,
} from "@/src/features/widgets/utils/import-export-utils";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { useClipboardWidgetProbe } from "@/src/features/widgets/hooks/useClipboardWidgetProbe";
import { isPasteablePlacementPayload } from "@/src/features/dashboard/utils/dashboard-import-export";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  formatMetricName,
  shouldUseWidgetSSE,
  sanitizePivotTableDefaultSort,
  getWidgetMetricPresentation,
  getWidgetMissingBucketValue,
} from "@/src/features/widgets/utils";
import { ChartLoadingState } from "@/src/features/widgets/chart-library/ChartLoadingState";
import {
  getChartLoadingProgress,
  getChartLoadingStateProps,
} from "@/src/features/widgets/chart-library/chartLoadingStateUtils";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { useScheduledDashboardExecuteQuery } from "@/src/hooks/useDashboardQueryScheduler";
import { CopyWidgetDialog } from "@/src/features/widgets/components/CopyWidgetDialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Badge } from "@/src/components/ui/badge";

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
  onLockedEditAttempt,
  readOnly,
  onPasteWidget,
  onDuplicateWidget,
}: {
  projectId: string;
  dashboardId: string;
  placement: WidgetPlacement;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
  onDeleteWidget: (tileId: string) => void;
  dashboardOwner: "LANGFUSE" | "PROJECT";
  schedulerId?: string;
  /**
   * Present on Langfuse-managed (read-only) dashboards: edit affordances stay
   * visible and any edit attempt routes here (clone-first flow) instead of
   * mutating.
   */
  onLockedEditAttempt?: () => void;
  /** Pure viewing surface (e.g. Home): render no edit affordances. */
  readOnly?: boolean;
  /**
   * Pastes the clipboard widget next to this tile. Passed only on editable
   * (non-locked) dashboards; absent → no "Paste to the right" menu item.
   */
  onPasteWidget?: (anchor: WidgetPlacement) => void;
  /**
   * Duplicates this widget (new widget row seeded from `widget`) next to this
   * tile. Passed only on editable (non-locked) dashboards.
   */
  onDuplicateWidget?: (
    anchor: WidgetPlacement,
    widget: WidgetExportSource,
  ) => void;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
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
  const widgetRequiresV2 = requiresV2({
    view: widget.data?.view ?? "traces",
    dimensions: widget.data?.dimensions ?? [],
    measures:
      widget.data?.metrics.map((metric) => ({ measure: metric.measure })) ?? [],
    filters: widget.data?.filters ?? [],
  });
  // If widget requires v2 features (minVersion >= 2), must use v2.
  // Otherwise follow the beta toggle.
  const metricsVersion: ViewVersion =
    widgetRequiresV2 || (widget.data?.minVersion ?? 1) >= 2
      ? "v2"
      : isBetaEnabled && (widget.data?.view ?? "traces") !== "traces"
        ? "v2"
        : "v1";
  const hasRbacCUDAccess = useHasProjectAccess({
    projectId,
    scope: "dashboards:CUD",
  });
  const hasCUDAccess = hasRbacCUDAccess && dashboardOwner !== "LANGFUSE";
  // Langfuse-managed dashboard, but the user could edit a clone: show the
  // same edit affordances and route attempts through the clone-first flow.
  const isLockedEditable =
    hasRbacCUDAccess &&
    dashboardOwner === "LANGFUSE" &&
    Boolean(onLockedEditAttempt);

  // Initialize sort state for pivot tables
  const defaultSort =
    widget.data?.chartConfig.type === "PIVOT_TABLE"
      ? sanitizePivotTableDefaultSort(widget.data.chartConfig.defaultSort, {
          dimensions: widget.data.dimensions,
          metrics: widget.data.metrics,
        })
      : undefined;

  const [sortState, setSortState] = useState<OrderByState | null>(() => {
    return defaultSort || null;
  });
  const [retryCount, setRetryCount] = useState(0);
  const [isCopyDialogOpen, setIsCopyDialogOpen] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  // Gate "Paste to the right" on the clipboard actually holding a pasteable
  // payload, where the browser lets us check silently.
  const isPasteablePayload = useCallback(
    (text: string) => isPasteablePlacementPayload(text, { isBetaEnabled }),
    [isBetaEnabled],
  );
  const clipboardProbe = useClipboardWidgetProbe(
    isActionsMenuOpen && Boolean(onPasteWidget),
    isPasteablePayload,
  );

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
        ...mapLegacyUiTableFilterToView(
          (widget.data?.view as z.infer<typeof views>) ?? "traces",
          widget.data?.filters ?? [],
        ),
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
      const isTimeSeries = isTimeSeriesChart(widget.data.chartType);

      const dimensionField =
        widget.data.dimensions.slice().shift()?.field ?? "none";
      const dimensionValue = item[dimensionField];

      // A gap-filled empty bucket arrives as a row with no dimension and the
      // metric column's type default: NULL for nullable aggregations
      // (avg/percentiles), 0 for non-nullable ones (count/uniq/sum). Keep it
      // as a pure bucket marker (holds the spot on the time axis) instead of
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
          dimension: undefined,
          metric: null,
          time_dimension: item["time_dimension"],
        };
      }

      return {
        dimension:
          dimensionValue !== undefined
            ? (() => {
                const val = dimensionValue;
                // Empty first: "" is a string, so the order matters. (LFE-10694)
                if (val === null || val === undefined || val === "")
                  return "n/a";
                if (typeof val === "string") return val;
                if (Array.isArray(val)) return val.join(", ");
                // Objects / numbers / booleans are stringified to avoid React key issues
                return String(val);
              })()
            : formatMetricName(metricField),
        metric: Array.isArray(metricValue)
          ? metricValue
          : // On a time series a missing value stays null — the chart renders
            // it by the metric's missing-bucket semantics instead of a fake 0.
            isTimeSeries && metricValue == null
            ? null
            : Number(metricValue || 0),
        time_dimension: item["time_dimension"],
      };
    });
  }, [queryResult.data, widget.data]);

  const chartPresentation = useMemo(() => {
    if (!widget.data) {
      return undefined;
    }

    if (widget.data.chartType === "PIVOT_TABLE") {
      return undefined;
    }

    const metric = widget.data.metrics[0];
    if (!metric) {
      return undefined;
    }

    return getWidgetMetricPresentation({
      metric,
      view: widget.data.view,
      version: metricsVersion,
    });
  }, [metricsVersion, widget.data]);

  // Memoize the Chart's config/chartConfig objects so the scheduler's page
  // re-renders don't hand Chart fresh literals every tick (transformedData is
  // already memoized) — letting Chart's React.memo bail. (LFE-10549)
  const chartConfigForRender = useMemo(() => {
    const data = widget.data;
    if (!data) return undefined;
    return {
      ...data.chartConfig,
      // For PIVOT_TABLE, enhance chartConfig with dimensions and metric field names
      ...(data.chartType === "PIVOT_TABLE" && {
        dimensions: data.dimensions.map((dim) => dim.field),
        metrics: data.metrics.map(
          (metric) => `${metric.agg}_${metric.measure}`,
        ),
        units: data.metrics.map((metric) =>
          getResultUnit(data.view, metric.measure, metric.agg, metricsVersion),
        ),
        defaultSort,
      }),
      ...(data.chartType !== "PIVOT_TABLE" && {
        unit: getResultUnit(
          data.view,
          data.metrics[0]?.measure ?? "",
          data.metrics[0]?.agg,
          metricsVersion,
        ),
      }),
    };
  }, [widget.data, metricsVersion, defaultSort]);

  const chartMetricConfig = useMemo(
    () =>
      chartPresentation
        ? { metric: { label: chartPresentation.label } }
        : undefined,
    [chartPresentation],
  );

  // "View as table" navigation: the widget's own filters (config + dashboard
  // global) translated to the traces/observations table's applicable filters,
  // plus the widget's time range. Filters the table can't express are dropped
  // (surfaced as a hint), never errored. The widget-filter merge mirrors the
  // query build above (widget.data.filters + dashboard filterState).
  const tableView = useMemo(() => {
    const view = widget.data?.view;
    if (!view) return undefined;
    const mergedFilters: FilterState = [
      ...(widget.data?.filters ?? []),
      ...filterState,
    ];
    return buildTableFilterHref(
      projectId,
      view as z.infer<typeof views>,
      mergedFilters,
      dateRange,
    );
  }, [projectId, widget.data, filterState, dateRange]);

  const handleViewAsTable = () => {
    if (!tableView) return;
    capture("dashboard:widget_view_as_table", {
      widget_id: placement.widgetId,
      dashboard_id: dashboardId,
      view: widget.data?.view,
      filters_not_applicable: tableView.notApplicable.size,
      filters_dropped_for_length: tableView.droppedForLength,
    });
    router.push(tableView.href);
  };

  // Hint combines both reasons a widget filter can be missing from the table:
  // dimensions the table can't express AND applicable filters dropped to keep
  // the ?filter= URL within budget. A length-drop must never be silent.
  const viewAsTableHint = useMemo(
    () => (tableView ? buildViewAsTableHint(tableView) : null),
    [tableView],
  );

  const handleEdit = () => {
    router.push(
      `/project/${projectId}/widgets/${placement.widgetId}?dashboardId=${dashboardId}`,
    );
  };

  const copyMutation = api.dashboardWidgets.copyToProject.useMutation({
    onSuccess: (data) => {
      capture("dashboard:widget_copied_to_project", {
        source_widget_id: placement.widgetId,
        new_widget_id: data.widgetId,
        dashboard_id: dashboardId,
      });
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
    if (isLockedEditable) {
      // The clone-first dialog is the confirmation on locked dashboards.
      onDeleteWidget(placement.id);
      return;
    }
    if (onDeleteWidget && confirm("Please confirm deletion")) {
      onDeleteWidget(placement.id);
    }
  };

  if (widget.isPending) {
    return (
      <div className="bg-background flex items-center justify-center rounded-lg border p-4">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!widget.data) {
    return (
      <div className="bg-background flex items-center justify-center rounded-lg border p-4">
        <div className="text-muted-foreground">Widget not found</div>
      </div>
    );
  }

  // Portable configuration of this widget, used by the copy / download /
  // duplicate menu actions.
  const widgetExportSource: WidgetExportSource = {
    name: widget.data.name,
    description: widget.data.description,
    view: widget.data.view,
    dimensions: widget.data.dimensions,
    metrics: widget.data.metrics.map((metric) => ({
      measure: metric.measure,
      agg: metric.agg as z.infer<typeof metricAggregations>,
    })),
    filters: widget.data.filters,
    chartType: widget.data.chartType,
    chartConfig: widget.data.chartConfig,
    minVersion: widget.data.minVersion,
  };

  const handleCopyToClipboard = async () => {
    try {
      await copyTextToClipboard(
        JSON.stringify(buildWidgetExport(widgetExportSource), null, 2),
      );
      capture("dashboard:widget_copied_to_clipboard", {
        surface: "grid_menu",
        kind: "widget",
        widget_id: placement.widgetId,
        dashboard_id: dashboardId,
      });
    } catch {
      showErrorToast("Copy failed", "Could not write to the clipboard.");
    }
  };

  const handleDownloadJson = () => {
    downloadWidgetJson(widgetExportSource);
    capture("dashboard:widget_json_downloaded", {
      surface: "grid_menu",
      widget_id: placement.widgetId,
      dashboard_id: dashboardId,
    });
  };

  return (
    <div className="bg-background group flex h-full w-full flex-col overflow-hidden rounded-lg border p-4">
      {isCopyDialogOpen && (
        <CopyWidgetDialog
          open={isCopyDialogOpen}
          onOpenChange={setIsCopyDialogOpen}
          widgetName={widget.data.name}
          onConfirm={handleCopy}
          isPending={copyMutation.isPending}
        />
      )}
      <div className="flex items-center justify-between">
        <span
          className="flex min-w-0 items-center gap-1.5 truncate text-base font-bold"
          title={widget.data.name}
        >
          <span className="truncate" title={widget.data.name}>
            {widget.data.name}
          </span>
          {dashboardOwner === "PROJECT" && widget.data.owner === "LANGFUSE" && (
            <Badge
              variant="secondary"
              className="shrink-0"
              title="Maintained by Langfuse — editing creates your own copy"
            >
              Langfuse
            </Badge>
          )}
        </span>
        <div className="flex space-x-2">
          {!readOnly && (hasCUDAccess || isLockedEditable) && (
            <>
              <GripVerticalIcon
                size={16}
                className="drag-handle text-muted-foreground hover:text-foreground hidden cursor-grab active:cursor-grabbing lg:group-hover:block"
              />
              {isLockedEditable ? (
                <button
                  onClick={onLockedEditAttempt}
                  className="text-muted-foreground hover:text-foreground hidden group-hover:block"
                  aria-label="Edit widget"
                >
                  <PencilIcon size={16} />
                </button>
              ) : widget.data.owner === "PROJECT" ? (
                <button
                  onClick={handleEdit}
                  className="text-muted-foreground hover:text-foreground hidden group-hover:block"
                  aria-label="Edit widget"
                >
                  <PencilIcon size={16} />
                </button>
              ) : widget.data.owner === "LANGFUSE" ? (
                <button
                  onClick={() => {
                    capture("dashboard:widget_copy_first_open", {
                      widget_id: placement.widgetId,
                      dashboard_id: dashboardId,
                    });
                    setIsCopyDialogOpen(true);
                  }}
                  className="text-muted-foreground hover:text-foreground hidden group-hover:block"
                  aria-label="Edit widget"
                >
                  <PencilIcon size={16} />
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
          <DropdownMenu onOpenChange={setIsActionsMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                className="text-muted-foreground hover:text-foreground hidden group-hover:block data-[state=open]:block"
                aria-label="Widget actions"
              >
                <MoreVerticalIcon size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {tableView && (
                <>
                  <DropdownMenuItem
                    onClick={handleViewAsTable}
                    title={viewAsTableHint?.title}
                  >
                    <TableIcon className="mr-2 h-4 w-4" />
                    <span className="flex flex-col">
                      <span>View as table</span>
                      {viewAsTableHint && (
                        <span className="text-muted-foreground text-xs">
                          {viewAsTableHint.count} filter
                          {viewAsTableHint.count === 1 ? "" : "s"} not shown in
                          the table
                        </span>
                      )}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={handleCopyToClipboard}>
                <CopyIcon className="mr-2 h-4 w-4" />
                Copy to clipboard
              </DropdownMenuItem>
              {onPasteWidget && (
                <DropdownMenuItem
                  disabled={clipboardProbe === "no-widget"}
                  onClick={() => onPasteWidget(placement)}
                >
                  <ClipboardPasteIcon className="mr-2 h-4 w-4" />
                  Paste to the right
                </DropdownMenuItem>
              )}
              {onDuplicateWidget && (
                <DropdownMenuItem
                  onClick={() =>
                    onDuplicateWidget(placement, widgetExportSource)
                  }
                >
                  <CopyPlusIcon className="mr-2 h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDownloadJson}>
                <FileJsonIcon className="mr-2 h-4 w-4" />
                Download as JSON
              </DropdownMenuItem>
              {/* Chart data download needs the query result to have loaded */}
              <DropdownMenuItem
                disabled={queryResult.isPending}
                onClick={() =>
                  downloadChartDataCsv(transformedData, widget.data.name)
                }
              >
                <DownloadIcon className="mr-2 h-4 w-4" />
                Download data as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
              // Sync the hover crosshair across all time-series widgets on this
              // dashboard (non-time-series chart types ignore it). (LFE-10549)
              syncId={dashboardId}
              config={chartMetricConfig}
              rowLimit={
                widget.data.chartConfig.type === "LINE_TIME_SERIES" ||
                widget.data.chartConfig.type === "BAR_TIME_SERIES" ||
                widget.data.chartConfig.type === "AREA_TIME_SERIES"
                  ? 100
                  : (widget.data.chartConfig.row_limit ?? 100)
              }
              chartConfig={chartConfigForRender}
              sortState={
                widget.data.chartType === "PIVOT_TABLE" ? sortState : undefined
              }
              onSortChange={
                widget.data.chartType === "PIVOT_TABLE" ? updateSort : undefined
              }
              isLoading={queryResult.isPending}
              metricFormatter={chartPresentation?.metricFormatter}
              missingValue={getWidgetMissingBucketValue(
                widget.data.metrics[0]?.agg ?? "count",
              )}
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
