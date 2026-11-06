/* eslint-disable @repo/no-style-props */
import { type FilterState } from "@langfuse/shared";
import { type DataCardActions } from "@/src/components/design-system/DataCard/DataCard";
import { compactNumberFormatter } from "@/src/utils/numbers";
import {
  type DashboardDateRangeAggregationOption,
  dashboardDateRangeAggregationSettings,
} from "@/src/utils/date-range-utils";
import { useDashboardCardTabs } from "@/src/features/dashboard/hooks/useDashboardCardTabs";
import { type QueryType, type ViewVersion } from "@langfuse/shared/query";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { WidgetChartCard } from "@/src/features/widgets/components/WidgetChartCard";
import { isChartDataEmpty } from "@/src/features/widgets/chart-library/isChartDataEmpty";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { useScheduledDashboardExecuteQuery } from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";
import { useMemo } from "react";

export const TracesAndObservationsTimeSeriesCard = ({
  actions,
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
  sync,
}: {
  actions?: DataCardActions;
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  agg: DashboardDateRangeAggregationOption;
  isLoading?: boolean;
  metricsVersion: ViewVersion;
  schedulerId?: string;
  syncId?: string;
  sync?: {
    activeKey: string | undefined;
    onActiveKeyChange: (key: string | undefined) => void;
  };
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
    (): DataPoint[] =>
      traces.data
        ? traces.data.map((item) => ({
            time_dimension: new Date(
              typeof item.time_dimension === "number"
                ? item.time_dimension
                : String(item.time_dimension),
            ).toISOString(),
            dimension: "Traces",
            metric: Number(item.count_count),
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
    (): DataPoint[] =>
      observations.data
        ? observations.data.map((item) => ({
            time_dimension: new Date(
              typeof item.time_dimension === "number"
                ? item.time_dimension
                : String(item.time_dimension),
            ).toISOString(),
            dimension: item.level as string,
            metric: Number(item.count_count),
          }))
        : [],
    [observations.data],
  );

  const totalObservations = observations.data?.reduce((acc, item) => {
    return acc + Number(item.count_count);
  }, 0);

  const data = isV2
    ? ([
        {
          tabTitle: "Observations by Level",
          data: transformedObservations,
          totalMetric: totalObservations,
          metricDescription: `Observations tracked`,
          chartMetricLabel: "Observations",
        },
      ] as const)
    : ([
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
      ] as const);

  const { selectedItem: item, tabs } = useDashboardCardTabs(data);
  const chartData = item.data;

  return (
    <div className={className}>
      <WidgetChartCard
        chartType="LINE_TIME_SERIES"
        actions={actions}
        title={isV2 ? "Observations by time" : "Traces by time"}
        tabs={tabs}
        content={(() => {
          if (
            isLoading ||
            observations.isPending ||
            (!isV2 && traces.isPending)
          )
            return { type: "loading", progress: { type: "spinner" } };
          if (isChartDataEmpty(chartData))
            return {
              type: "empty",
              description:
                "Traces contain details about LLM applications and can be created using the SDK.",
              href: "https://langfuse.com/docs/observability/overview",
            };
          return undefined;
        })()}
        metric={{
          description: item.metricDescription,
          value: item.totalMetric
            ? compactNumberFormatter(item.totalMetric)
            : compactNumberFormatter(0),
        }}
        data={chartData}
        label={item.chartMetricLabel}
        // Counts are additive: the legend total reconciles with
        // the card headline. (LFE-10498)
        legendSummary="sum"
        syncId={syncId}
        sync={sync}
        // Additive counts: a bucket without data honestly counts 0. (LFE-10694)
        missingValue="zero"
      />
    </div>
  );
};
