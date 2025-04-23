import { useMemo } from "react";
import { api } from "@/src/utils/api";
import {
  type views,
  type metricAggregations,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";
import { type z } from "zod";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { type FilterState } from "@langfuse/shared";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import { PencilIcon, TrashIcon } from "lucide-react";
import { useRouter } from "next/router";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { startCase } from "lodash";

interface WidgetPlacement {
  id: string;
  widgetId: string;
  x: number;
  y: number;
  x_size: number;
  y_size: number;
  type: "widget";
}

// Generate grid classes for each widget based on position and size
const getGridClasses = (widget: WidgetPlacement) => {
  return `col-start-${widget.x + 1} col-span-${widget.x_size} row-start-${widget.y + 1} row-span-${widget.y_size}`;
};

export function DashboardWidget({
  projectId,
  placement,
  dateRange,
  filterState,
  onDeleteWidget,
}: {
  projectId: string;
  placement: WidgetPlacement;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
  onDeleteWidget: (tileId: string) => void;
}) {
  const router = useRouter();
  const widget = api.dashboardWidgets.get.useQuery(
    {
      widgetId: placement.widgetId,
      projectId,
    },
    {
      enabled: Boolean(projectId),
    },
  );

  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "dashboards:CUD",
  });

  const fromTimestamp = dateRange
    ? dateRange.from
    : new Date(new Date().getTime() - 1000);
  const toTimestamp = dateRange ? dateRange.to : new Date();

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
        orderBy: null,
      },
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      enabled: !widget.isLoading && Boolean(widget.data),
    },
  );

  const transformedData = useMemo(() => {
    if (!widget.data || !queryResult.data) {
      return [];
    }
    return queryResult.data.map((item: any) => {
      // Get the dimension field (first dimension in the query)
      const dimensionField =
        widget.data.dimensions.slice().shift()?.field ?? "none";
      // Get the metric field (first metric in the query with its aggregation)
      const metric = widget.data.metrics.slice().shift() ?? {
        measure: "count",
        agg: "count",
      };
      const metricField = `${metric.agg}_${metric.measure}`;

      return {
        dimension: item[dimensionField]
          ? (item[dimensionField] as string)
          : startCase(metricField === "count_count" ? "Count" : metricField),
        metric: Number(item[metricField] || 0),
        time_dimension: item["time_dimension"],
      };
    });
  }, [queryResult.data, widget.data]);

  if (widget.isLoading) {
    return (
      <div
        className={`${getGridClasses(placement)} flex items-center justify-center rounded-lg border bg-background p-4`}
      >
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!widget.data) {
    return (
      <div
        className={`${getGridClasses(placement)} flex items-center justify-center rounded-lg border bg-background p-4`}
      >
        <div className="text-muted-foreground">Widget not found</div>
      </div>
    );
  }

  const handleEdit = () => {
    router.push(`/project/${projectId}/widgets/${placement.widgetId}`);
  };

  const handleDelete = () => {
    if (onDeleteWidget && confirm("Please confirm deletion")) {
      onDeleteWidget(placement.id);
    }
  };

  return (
    <div
      className={`${getGridClasses(placement)} group flex flex-col overflow-hidden rounded-lg border bg-background p-4`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">{widget.data.name}</span>
        <div className="flex space-x-2">
          <button
            onClick={handleEdit}
            className="hidden text-muted-foreground hover:text-foreground group-hover:block"
            aria-label="Edit widget"
            disabled={!hasCUDAccess}
          >
            <PencilIcon size={16} />
          </button>
          <button
            onClick={handleDelete}
            className="hidden text-muted-foreground hover:text-destructive group-hover:block"
            aria-label="Delete widget"
            disabled={!hasCUDAccess}
          >
            <TrashIcon size={16} />
          </button>
        </div>
      </div>
      <div className="mb-4 text-sm text-muted-foreground">
        {widget.data.description}
      </div>
      <div className="min-h-0 flex-1">
        <Chart
          chartType={widget.data.chartType}
          data={transformedData}
          rowLimit={
            widget.data.chartConfig.type === "LINE_TIME_SERIES" ||
            widget.data.chartConfig.type === "BAR_TIME_SERIES"
              ? 100
              : (widget.data.chartConfig.row_limit ?? 100)
          }
        />
      </div>
    </div>
  );
}
