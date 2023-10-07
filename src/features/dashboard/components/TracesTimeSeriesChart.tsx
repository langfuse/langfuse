import { api } from "@/src/utils/api";
import {
  dateTimeAggregationSettings,
  type DateTimeAggregationOption,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import { type FilterState } from "@/src/features/filters/types";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/base/BaseTimeSeriesChart";

export const TracesTimeSeriesChart = ({
  className,
  projectId,
  globalFilterState,
  agg,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  agg: DateTimeAggregationOption;
}) => {
  const traces = api.dashboard.chart.useQuery({
    projectId,
    from: "traces",
    select: [{ column: "traceId", agg: "COUNT" }],
    filter:
      globalFilterState.map((f) =>
        f.type === "datetime" ? { ...f, column: "timestamp" } : f,
      ) ?? [],
    groupBy: [
      {
        type: "datetime",
        column: "timestamp",
        temporalUnit: dateTimeAggregationSettings[agg].date_trunc,
      },
    ],
    orderBy: [],
    limit: null,
  });

  const transformedTraces = traces.data
    ? traces.data.map((item) => {
        return {
          ts: (item.timestamp as Date).getTime(),
          values: [
            {
              label: "Traces",
              value:
                typeof item.countTraceId === "number"
                  ? item.countTraceId
                  : undefined,
            },
          ],
        };
      })
    : [];

  return (
    <DashboardCard
      className={className}
      title="Traces"
      description="Number of traces tracked"
      isLoading={traces.isLoading}
    >
      <BaseTimeSeriesChart
        agg={agg}
        data={transformedTraces ?? []}
        connectNulls={true}
      />
    </DashboardCard>
  );
};
