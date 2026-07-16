import { type FilterState } from "@langfuse/shared";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { isEmptyTimeSeries } from "@/src/features/dashboard/components/hooks";
import {
  type DashboardDateRangeAggregationOption,
  dashboardDateRangeAggregationSettings,
} from "@/src/utils/date-range-utils";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { TabComponent } from "@/src/features/dashboard/components/TabsComponent";
import { type QueryType, type ViewVersion } from "@langfuse/shared/query";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { DashboardLineTimeSeriesChart } from "@/src/features/dashboard/components/DashboardLineTimeSeriesChart";
import { useScheduledDashboardExecuteQuery } from "@/src/hooks/useDashboardQueryScheduler";
import { useMemo } from "react";

export const TracesAndObservationsTimeSeriesChart = ({
  className,
  projectId,
  globalFilterState,
  fromTimestamp,
  toTimestamp,
  agg,
  isLoading = false,
  metricsVersion,
  schedulerId,
  syncId,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  agg: DashboardDateRangeAggregationOption;
  isLoading?: boolean;
  metricsVersion?: ViewVersion;
  schedulerId?: string;
  syncId?: string;
}) => {
  const isV2 = metricsVersion === "v2";

  const tracesQuery: QueryType = {
    view: "traces",
    dimensions: [],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: mapLegacyUiTableFilterToView("traces", globalFilterState),
    timeDimension: {
      granularity:
        dashboardDateRangeAggregationSettings[agg].dateTrunc ?? "day",
    },
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  const traces = useScheduledDashboardExecuteQuery(
    {
      projectId,
      query: tracesQuery,
      version: metricsVersion,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      queryId: `${schedulerId ?? "home:traces-time-series"}:traces`,
      enabled: !isLoading && !isV2,
    },
  );

  // Memoized on the raw query result so the reference is stable across the
  // dashboard scheduler's page re-renders — that's what lets the chart's
  // React.memo bail. (LFE-10549)
  const transformedTraces = useMemo(
    () =>
      traces.data
        ? traces.data.map((item) => ({
            ts: new Date(item.time_dimension as any).getTime(),
            values: [{ label: "Traces", value: Number(item.count_count) }],
          }))
        : [],
    [traces.data],
  );

  const total = traces.data?.reduce((acc, item) => {
    return acc + Number(item.count_count);
  }, 0);

  const observationsQuery: QueryType = {
    view: "observations",
    dimensions: [{ field: "level" }],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: mapLegacyUiTableFilterToView("observations", globalFilterState),
    timeDimension: {
      granularity:
        dashboardDateRangeAggregationSettings[agg].dateTrunc ?? "day",
    },
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  const observations = useScheduledDashboardExecuteQuery(
    {
      projectId,
      query: observationsQuery,
      version: metricsVersion,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      queryId: `${schedulerId ?? "home:traces-time-series"}:observations`,
      enabled: !isLoading,
    },
  );

  const transformedObservations = useMemo(
    () =>
      observations.data
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
        : [],
    [observations.data],
  );

  const totalObservations = observations.data?.reduce((acc, item) => {
    return acc + Number(item.count_count);
  }, 0);

  const data = isV2
    ? [
        {
          tabTitle: "Observations by Level",
          data: transformedObservations,
          totalMetric: totalObservations,
          metricDescription: `Observations tracked`,
          chartMetricLabel: "Observations",
        },
      ]
    : [
        {
          tabTitle: "Traces",
          data: transformedTraces,
          totalMetric: total,
          metricDescription: `Traces tracked`,
          chartMetricLabel: "Traces",
        },
        {
          tabTitle: "Observations by Level",
          data: transformedObservations,
          totalMetric: totalObservations,
          metricDescription: `Observations tracked`,
          chartMetricLabel: "Observations",
        },
      ];

  return (
    <DashboardCard
      className={className}
      title={isV2 ? "Observations by time" : "Traces by time"}
      isLoading={
        isLoading || observations.isPending || (!isV2 && traces.isPending)
      }
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
                  // The height is the flex basis (floor); grow lets the chart absorb
                  // extra tile height. On grid (lg) screens the floor is smaller so
                  // tiles fit narrow viewports — grow recovers the height above the
                  // grid's rowHeight floor. (LFE-10813)
                  <div className="h-80 w-full shrink-0 grow lg:h-56">
                    <DashboardLineTimeSeriesChart
                      data={item.data}
                      label={item.chartMetricLabel}
                      // Counts are additive: the legend total reconciles with
                      // the card headline. (LFE-10498)
                      legendSummary="sum"
                      syncId={syncId}
                      // Additive counts: a bucket without data honestly counts 0. (LFE-10694)
                      missingValue="zero"
                    />
                  </div>
                ) : (
                  <NoDataOrLoading
                    isLoading={
                      isLoading ||
                      observations.isPending ||
                      (!isV2 && traces.isPending)
                    }
                    description="Traces contain details about LLM applications and can be created using the SDK."
                    href="https://langfuse.com/docs/observability/overview"
                    className="h-auto grow"
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
