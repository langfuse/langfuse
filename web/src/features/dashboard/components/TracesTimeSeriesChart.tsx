import { api } from "@/src/utils/api";
import { type FilterState } from "@langfuse/shared";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { isEmptyTimeSeries } from "@/src/features/dashboard/components/hooks";
import { type DashboardDateRangeAggregationOption } from "@/src/utils/date-range-utils";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { TabComponent } from "@/src/features/dashboard/components/TabsComponent";
import {
  type QueryType,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";

export const TracesAndObservationsTimeSeriesChart = ({
  className,
  projectId,
  globalFilterState,
  fromTimestamp,
  toTimestamp,
  agg,
  isLoading = false,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  agg: DashboardDateRangeAggregationOption;
  isLoading?: boolean;
}) => {
  const tracesQuery: QueryType = {
    view: "traces",
    dimensions: [],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: mapLegacyUiTableFilterToView("traces", globalFilterState),
    timeDimension: {
      granularity: "auto",
    },
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  const traces = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: tracesQuery,
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
          ts: new Date(item.time_dimension as any).getTime(),
          values: [
            {
              label: "Traces",
              value: Number(item.count_count),
            },
          ],
        };
      })
    : [];

  const total = traces.data?.reduce((acc, item) => {
    return acc + Number(item.count_count);
  }, 0);

  const observationsQuery: QueryType = {
    view: "observations",
    dimensions: [{ field: "level" }],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: mapLegacyUiTableFilterToView("observations", globalFilterState),
    timeDimension: {
      granularity: "auto",
    },
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  const observations = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: observationsQuery,
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
          const ts = new Date(item.time_dimension as any).getTime();
          if (!acc[ts]) {
            acc[ts] = {
              ts,
              values: [],
            };
          }
          acc[ts].values.push({
            label: item.level as string,
            value: Number(item.count_count),
          });

          return acc;
        }, {}),
      )
    : [];

  const totalObservations = observations.data?.reduce((acc, item) => {
    return acc + Number(item.count_count);
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
