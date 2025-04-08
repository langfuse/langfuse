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

interface WidgetPlacement {
  id: string;
  x: number;
  y: number;
  x_size: number;
  y_size: number;
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
}: {
  projectId: string;
  placement: WidgetPlacement;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
}) {
  const widget = api.dashboardWidgets.get.useQuery(
    {
      widgetId: placement.id,
      projectId,
    },
    {
      enabled: Boolean(projectId),
    },
  );

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
        timeDimension: { granularity: "auto" },
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
          : "n/a",
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

  return (
    <div
      className={`${getGridClasses(placement)} flex flex-col overflow-hidden rounded-lg border bg-background p-4`}
    >
      <div className="mb-2 font-medium">{widget.data.name}</div>
      <div className="mb-4 text-sm text-muted-foreground">
        {widget.data.description}
      </div>
      <div className="min-h-0 flex-1">
        <Chart
          chartType={widget.data.chartType}
          data={transformedData}
          rowLimit={widget.data.chartConfig?.row_limit}
        />
      </div>
    </div>
  );
}
