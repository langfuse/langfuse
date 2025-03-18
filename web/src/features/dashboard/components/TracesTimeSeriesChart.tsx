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
import { TabComponent } from "@/src/features/dashboard/components/TabsComponent";

export const TracesAndObservationsTimeSeriesChart = ({
  className,
  projectId,
  globalFilterState,
  agg,
  isLoading = false,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  agg: DashboardDateRangeAggregationOption;
  isLoading?: boolean;
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
      queryName: "traces-timeseries",
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      enabled: !isLoading,
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

  const observations = api.dashboard.chart.useQuery(
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
      queryName: "observations-status-timeseries",
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      enabled: !isLoading,
    },
  );

  const transformedObservations = observations.data
    ? Object.values(
        observations.data.reduce<
          Record<
            number,
            {
              ts: number;
              values: { label: string; value: number | undefined }[];
            }
          >
        >((acc, item) => {
          const ts = (item.start_time_bucket as Date).getTime();
          if (!acc[ts]) {
            acc[ts] = {
              ts,
              values: [],
            };
          }
          acc[ts].values.push({
            label: item.level as string,
            value: typeof item.count === "number" ? item.count : undefined,
          });

          return acc;
        }, {}),
      )
    : [];

  const totalObservations = observations.data?.reduce((acc, item) => {
    return acc + (item.count as number);
  }, 0);

  const data = [
    {
      tabTitle: "Traces",
      data: transformedTraces,
      totalMetric: total,
      metricDescription: `Traces tracked`,
    },
    {
      tabTitle: "Observations by Level",
      data: transformedObservations,
      totalMetric: totalObservations,
      metricDescription: `Observations tracked`,
    },
  ];

  return (
    <DashboardCard
      className={className}
      title="Traces by time"
      isLoading={isLoading || traces.isLoading}
      cardContentClassName="flex flex-col content-end "
    >
      <TabComponent
        tabs={data.map((item) => {
          return {
            tabTitle: item.tabTitle,
            content: (
              <>
                <TotalMetric
                  description={item.metricDescription}
                  metric={
                    item.totalMetric
                      ? compactNumberFormatter(item.totalMetric)
                      : compactNumberFormatter(0)
                  }
                />
                {!isEmptyTimeSeries({ data: item.data }) ? (
                  <BaseTimeSeriesChart
                    className="h-full min-h-80 self-stretch"
                    agg={agg}
                    data={item.data}
                    connectNulls={true}
                    chartType="area"
                  />
                ) : (
                  <NoDataOrLoading
                    isLoading={isLoading || traces.isLoading}
                    description="Traces contain details about LLM applications and can be created using the SDK."
                    href="https://langfuse.com/docs/tracing"
                  />
                )}
              </>
            ),
          };
        })}
      />
    </DashboardCard>
  );
};
