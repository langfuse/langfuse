import { api } from "@/src/utils/api";
import { type FilterState } from "@langfuse/shared";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { isEmptyTimeSeries } from "@/src/features/dashboard/components/hooks";
import {
  dashboardDateRangeAggregationSettings,
  type DashboardDateRangeAggregationOption,
} from "@/src/utils/date-range-utils";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { useClickhouse } from "@/src/components/layouts/ClickhouseAdminToggle";

export const TracesTimeSeriesChart = ({
  className,
  projectId,
  globalFilterState,
  agg,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  agg: DashboardDateRangeAggregationOption;
}) => {
  const traces = api.dashboard.chart.useQuery(
    {
      projectId,
      from: "traces",
      select: [{ column: "traceId", agg: "COUNT" }],
      filter: globalFilterState.map((f) =>
        f.type === "datetime" ? { ...f, column: "timestamp" } : f,
      ),
      groupBy: [
        {
          type: "datetime",
          column: "timestamp",
          temporalUnit: dashboardDateRangeAggregationSettings[agg].date_trunc,
        },
      ],
      queryClickhouse: useClickhouse(),
      queryName: "traces-timeseries",
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

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

  const total = traces.data?.reduce((acc, item) => {
    return acc + (item.countTraceId as number);
  }, 0);

  return (
    <DashboardCard
      className={className}
      title="Traces"
      isLoading={traces.isLoading}
      cardContentClassName="flex flex-col content-end "
    >
      <TotalMetric
        description={`Traces tracked`}
        metric={
          total ? compactNumberFormatter(total) : compactNumberFormatter(0)
        }
      />
      {!isEmptyTimeSeries({ data: transformedTraces }) ? (
        <BaseTimeSeriesChart
          className="h-full min-h-80 self-stretch"
          agg={agg}
          data={transformedTraces}
          connectNulls={true}
          chartType="area"
        />
      ) : (
        <NoDataOrLoading
          isLoading={traces.isLoading}
          description="Traces contain details about LLM applications and can be created using the SDK."
          href="https://langfuse.com/docs/tracing"
        />
      )}
    </DashboardCard>
  );
};
