import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/src/utils/api";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";
import {
  buildWidgetOrderBy,
  getResultUnit,
  isV2BreakdownChart,
  resolveWidgetRenderVersion,
  toQueryChartConfig,
  validateQuery,
  type QueryType,
  type metricAggregations,
  type views,
} from "@langfuse/shared/query";
import { type z } from "zod";
import {
  type ChartProps,
  type DataPoint,
} from "@/src/features/widgets/chart-library/chart-props";
import { type FilterState, type OrderByState } from "@langfuse/shared";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import {
  PencilIcon,
  TrashIcon,
  CopyIcon,
  CopyPlusIcon,
  FileJsonIcon,
  DownloadIcon,
  TableIcon,
} from "@langfuse/icons";
import { useRouter } from "next/router";
import {
  buildTableFilterHref,
  buildViewAsTableHint,
} from "@/src/features/dashboard/lib/buildTableFilterHref";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { downloadChartDataCsv } from "@/src/features/widgets/chart-library/downloadChartDataCsv";
import {
  buildWidgetExport,
  downloadWidgetJson,
  type WidgetExportSource,
} from "@/src/features/widgets/utils/import-export-utils";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { useCaptureWidgetHighCardinalityError } from "@/src/features/widgets/hooks/useWidgetQueryErrorCapture";
import {
  mergeWidgetAndDashboardFilters,
  shouldUseWidgetSSE,
  sanitizePivotTableDefaultSort,
  getWidgetMetricPresentation,
  getWidgetMissingBucketValue,
} from "@/src/features/widgets/utils";
import type { ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { useScheduledDashboardExecuteQuery } from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";
import { CopyWidgetDialog } from "@/src/features/widgets/components/CopyWidgetDialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { WidgetChartCard } from "./WidgetChartCard";
import { getWidgetChartQueryState } from "../fns/getWidgetChartQueryState";
import { toWidgetChartDataPoint } from "../fns/toWidgetChartDataPoint";

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
  chartSync,
  readPath,
  placement,
  dateRange,
  filterState,
  onDeleteWidget,
  dashboardOwner,
  schedulerId,
  onLockedEditAttempt,
  readOnly,
  onDuplicateWidget,
}: {
  projectId: string;
  dashboardId: string;
  chartSync: ChartProps["sync"];
  /** Resolved by the page controller — the widget must not guess the version. */
  readPath: ResolvedReadPath;
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
   * Clones this widget (new widget row seeded from `widget`) next to this
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
  const isV4 = readPath === "v4";
  const widget = api.dashboardWidgets.get.useQuery(
    {
      widgetId: placement.widgetId,
      projectId,
    },
    {
      enabled: Boolean(projectId),
    },
  );
  const metricsVersion = resolveWidgetRenderVersion({
    shape: {
      view: widget.data?.view ?? "traces",
      dimensions: widget.data?.dimensions ?? [],
      measures:
        widget.data?.metrics.map((metric) => ({ measure: metric.measure })) ??
        [],
      filters: widget.data?.filters ?? [],
    },
    persistedMinVersion: widget.data?.minVersion,
    newestReadableVersion: isV4 ? "v2" : "v1",
  });
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

    const view = (widget.data?.view as z.infer<typeof views>) ?? "traces";

    // A widget's own environment filter overrides the dashboard's global
    // environment selector; other dashboard-global filters still merge in.
    // (LFE-14333 — see mergeWidgetAndDashboardFilters.)
    const mergedFilters = mergeWidgetAndDashboardFilters({
      view,
      widgetFilters: widget.data?.filters ?? [],
      dashboardFilters: filterState,
    });

    return {
      view,
      dimensions: widget.data?.dimensions ?? [],
      metrics:
        widget.data?.metrics.map((metric) => ({
          measure: metric.measure,
          aggregation: metric.agg as z.infer<typeof metricAggregations>,
        })) ?? [],
      filters: mergedFilters,
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
  useCaptureWidgetHighCardinalityError({
    validation: queryValidation,
    surface: "dashboard_tile",
    chartType: widget.data?.chartType,
    isV4: metricsVersion === "v2",
  });
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
        silentHttpCodes: [412, 422],
      },
      refreshKey: retryCount,
      useSSE: shouldUseWidgetSSE({
        isV4Enabled: isV4,
        version: metricsVersion,
      }),
      enabled:
        !widget.isPending && Boolean(widget.data) && queryValidation.valid,
    },
  );

  const usesBackendProgress = shouldUseWidgetSSE({
    isV4Enabled: isV4,
    version: metricsVersion,
  });
  const loadingStateLayout = (() => {
    if (placement.y_size <= 2) {
      return "tight";
    }
    if (placement.x_size <= 4) {
      return "compact";
    }
    return "default";
  })();
  const { chartLoadingState, loadingProgress } = getWidgetChartQueryState({
    ...queryResult,
    usesBackendProgress,
  });
  const handleRetry = useCallback(() => {
    setRetryCount((current) => current + 1);
  }, []);

  const transformedData = useMemo<DataPoint[]>(() => {
    if (!widget.data || !queryResult.data) {
      return [];
    }
    return queryResult.data.map((item) => {
      const timeDimension =
        typeof item.time_dimension === "string"
          ? item.time_dimension
          : undefined;
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
          time_dimension: timeDimension,
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
      const dimensionField =
        widget.data.dimensions.slice().shift()?.field ?? "none";
      return toWidgetChartDataPoint({
        metricValue: item[metricField],
        metricField,
        aggregation: metric.agg,
        dimensionValue: item[dimensionField],
        timeDimension,
        isTimeSeries: isTimeSeriesChart(widget.data.chartType),
        dimensionLabelMap: undefined,
        normalizeHistogram: true,
      });
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
  // query build above via mergeWidgetAndDashboardFilters, so the environment
  // override applies here too: a widget with its own environment filter must
  // deep-link to a table scoped to ITS environment, not one carrying both the
  // widget's and the dashboard selector's contradictory environment filters
  // (which the table treats as applicable → empty table). (LFE-14333)
  // buildTableFilterHref maps to view space again internally; that re-map is
  // idempotent for the already-canonical columns this helper returns
  // (isCanonicalViewFilterColumn short-circuits them), so no filter is
  // double-mapped or dropped.
  const tableView = useMemo(() => {
    const view = widget.data?.view;
    if (!view) return undefined;
    const mergedFilters = mergeWidgetAndDashboardFilters({
      view: view as z.infer<typeof views>,
      widgetFilters: widget.data?.filters ?? [],
      dashboardFilters: filterState,
    });
    return buildTableFilterHref(
      projectId,
      view as z.infer<typeof views>,
      mergedFilters,
      dateRange,
      readPath,
    );
  }, [projectId, widget.data, filterState, dateRange, readPath]);

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
      showErrorToast(
        "Failed to clone widget",
        e.message,
        classifyTrpcToastError(e, "widget.clone"),
      );
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
    // Built-in widgets have a subtitle even before their definition is available.
    return (
      <WidgetChartCard
        title="Loading widget"
        description={dashboardOwner === "LANGFUSE" ? "\u00a0" : undefined}
        content={{ type: "loading", progress: { type: "spinner" } }}
      />
    );
  }

  if (!widget.data) {
    return (
      <WidgetChartCard
        title="Widget unavailable"
        content={{
          type: "error",
          message: widget.error?.message ?? "Widget not found",
        }}
      />
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
      showSuccessToast({
        operation: "widget.copy",
        title: "Widget copied",
        description: "Paste it on any dashboard with Cmd/Ctrl+V.",
      });
    } catch {
      showErrorToast("Copy failed", "Could not write to the clipboard.", {
        operation: "widget.copy",
        errorOrigin: "frontend",
        errorCategory: "permission",
      });
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
    <>
      {isCopyDialogOpen && (
        <CopyWidgetDialog
          open={isCopyDialogOpen}
          onOpenChange={setIsCopyDialogOpen}
          widgetName={widget.data.name}
          onConfirm={handleCopy}
          isPending={copyMutation.isPending}
        />
      )}
      <WidgetChartCard
        chartType={widget.data.chartType}
        title={widget.data.name}
        description={widget.data.description}
        badge={
          dashboardOwner === "PROJECT" && widget.data.owner === "LANGFUSE"
            ? {
                text: "Langfuse",
                description:
                  "Maintained by Langfuse — editing creates your own copy",
              }
            : undefined
        }
        content={(() => {
          if (!queryValidation.valid)
            return {
              type: "error",
              message: queryValidation.reason,
              layout: loadingStateLayout,
            };
          if (queryResult.isError)
            return {
              type: "error",
              layout: loadingStateLayout,
              message: chartLoadingState.hintText ?? "Query failed",
              onRetry: handleRetry,
            };
          if (queryResult.isPending)
            return {
              type: "loading",
              layout: loadingStateLayout,
              progress: loadingProgress,
              hintText: chartLoadingState.hintText,
            };
          return undefined;
        })()}
        actions={{
          draggable: !readOnly && (hasCUDAccess || isLockedEditable),
          buttons:
            !readOnly && (hasCUDAccess || isLockedEditable)
              ? [
                  {
                    id: "edit",
                    label: "Edit widget",
                    icon: PencilIcon,
                    onClick: () => {
                      if (isLockedEditable) {
                        onLockedEditAttempt?.();
                        return;
                      }
                      if (widget.data.owner === "PROJECT") {
                        handleEdit();
                        return;
                      }
                      capture("dashboard:widget_copy_first_open", {
                        widget_id: placement.widgetId,
                        dashboard_id: dashboardId,
                      });
                      setIsCopyDialogOpen(true);
                    },
                  },
                ]
              : [],
          menu: [
            ...(tableView
              ? [
                  {
                    type: "item" as const,
                    id: "view-as-table",
                    title: viewAsTableHint
                      ? `View as table (${viewAsTableHint.count} filter${viewAsTableHint.count === 1 ? "" : "s"} not shown in the table)`
                      : "View as table",
                    tooltip: viewAsTableHint?.title,
                    icon: TableIcon,
                    onClick: handleViewAsTable,
                  },
                  {
                    id: "table-separator",
                    type: "separator" as const,
                  },
                ]
              : []),
            {
              type: "item",
              id: "copy",
              title: "Copy widget",
              icon: CopyIcon,
              onClick: handleCopyToClipboard,
            },
            ...(onDuplicateWidget
              ? [
                  {
                    type: "item" as const,
                    id: "clone",
                    title: "Clone",
                    icon: CopyPlusIcon,
                    onClick: () =>
                      onDuplicateWidget(placement, widgetExportSource),
                  },
                ]
              : []),
            { id: "download-separator", type: "separator" },
            {
              type: "item",
              id: "download-json",
              title: "Download as JSON",
              icon: FileJsonIcon,
              onClick: handleDownloadJson,
            },
            {
              type: "item",
              id: "download-csv",
              title: "Download data as CSV",
              icon: DownloadIcon,
              disabled: queryResult.isPending
                ? { reason: "Chart data is still loading" }
                : undefined,
              onClick: () =>
                downloadChartDataCsv(transformedData, widget.data.name),
            },
            ...(!readOnly && (hasCUDAccess || isLockedEditable)
              ? [
                  {
                    id: "delete-separator",
                    type: "separator" as const,
                  },
                  {
                    type: "item" as const,
                    id: "delete",
                    title: "Delete",
                    icon: TrashIcon,
                    variant: "destructive" as const,
                    onClick: handleDelete,
                  },
                ]
              : []),
          ],
        }}
        data={transformedData}
        syncId={dashboardId}
        sync={chartSync}
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
        metricFormatter={chartPresentation?.metricFormatter}
        missingValue={getWidgetMissingBucketValue(
          widget.data.metrics[0]?.agg ?? "count",
        )}
      />
    </>
  );
}
