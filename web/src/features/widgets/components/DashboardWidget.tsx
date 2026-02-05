import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/src/utils/api";
import {
  type views,
  type metricAggregations,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";
import { type z } from "zod/v4";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { type FilterState, type OrderByState } from "@langfuse/shared";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import {
  PencilIcon,
  TrashIcon,
  CopyIcon,
  GripVerticalIcon,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/router";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { DownloadButton } from "@/src/features/widgets/chart-library/DownloadButton";
import { formatMetricName } from "@/src/features/widgets/utils";

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
}: {
  projectId: string;
  dashboardId: string;
  placement: WidgetPlacement;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
  onDeleteWidget: (tileId: string) => void;
  dashboardOwner: "LANGFUSE" | "PROJECT";
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const widget = api.dashboardWidgets.get.useQuery(
    {
      widgetId: placement.widgetId,
      projectId,
    },
    {
      enabled: Boolean(projectId),
    },
  );
  const hasCUDAccess =
    useHasProjectAccess({ projectId, scope: "dashboards:CUD" }) &&
    dashboardOwner !== "LANGFUSE";

  const fromTimestamp = dateRange
    ? dateRange.from
    : new Date(new Date().getTime() - 1000);
  const toTimestamp = dateRange ? dateRange.to : new Date();

  // Initialize sort state for pivot tables
  const defaultSort =
    widget.data?.chartConfig.type === "PIVOT_TABLE"
      ? widget.data?.chartConfig.defaultSort
      : undefined;

  const [sortState, setSortState] = useState<OrderByState | null>(() => {
    return defaultSort || null;
  });

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

  const queryResult = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: {
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
        timeDimension: isTimeSeriesChart(
          widget.data?.chartType ?? "LINE_TIME_SERIES",
        )
          ? { granularity: "auto" }
          : null,
        fromTimestamp: fromTimestamp.toISOString(),
        toTimestamp: toTimestamp.toISOString(),
        orderBy:
          widget.data?.chartConfig.type === "PIVOT_TABLE" && sortState
            ? [
                {
                  field: sortState.column,
                  direction: sortState.order.toLowerCase() as "asc" | "desc",
                },
              ]
            : null,
        chartConfig: widget.data?.chartConfig,
      },
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      enabled: !widget.isPending && Boolean(widget.data),
    },
  );

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
        className={`flex items-center justify-center rounded-lg border bg-background p-4`}
      >
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!widget.data) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border bg-background p-4`}
      >
        <div className="text-muted-foreground">Widget not found</div>
      </div>
    );
  }

  return (
    <div
      className={`group flex h-full w-full flex-col overflow-hidden rounded-lg border bg-background p-4`}
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
                className="drag-handle hidden cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing lg:group-hover:block"
              />
              {widget.data.owner === "PROJECT" ? (
                <button
                  onClick={handleEdit}
                  className="hidden text-muted-foreground hover:text-foreground group-hover:block"
                  aria-label="Edit widget"
                >
                  <PencilIcon size={16} />
                </button>
              ) : widget.data.owner === "LANGFUSE" ? (
                <button
                  onClick={handleCopy}
                  className="hidden text-muted-foreground hover:text-foreground group-hover:block"
                  aria-label="Copy widget"
                >
                  <CopyIcon size={16} />
                </button>
              ) : null}
              <button
                onClick={handleDelete}
                className="hidden text-muted-foreground hover:text-destructive group-hover:block"
                aria-label="Delete widget"
              >
                <TrashIcon size={16} />
              </button>
            </>
          )}
          {/* Download button or loading indicator - always available */}
          {queryResult.isPending ? (
            <div
              className="text-muted-foreground"
              aria-label="Loading chart data"
              title="Loading..."
            >
              <Loader2 size={16} className="animate-spin" />
            </div>
          ) : (
            <DownloadButton
              data={transformedData}
              fileName={widget.data.name}
              className="hidden group-hover:block"
            />
          )}
        </div>
      </div>
      <div
        className="mb-4 truncate text-sm text-muted-foreground"
        title={widget.data.description}
      >
        {widget.data.description}
      </div>
      <div className="min-h-0 flex-1">
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
      </div>
    </div>
  );
}
