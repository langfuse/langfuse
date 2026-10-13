/* eslint-disable @repo/no-style-props */
import { type FilterState, getGenerationLikeTypes } from "@langfuse/shared";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { compactNumberFormatter, costFormatter } from "@/src/utils/numbers";
import { TabComponent } from "@/src/features/dashboard/components/TabsComponent";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { type QueryType, type ViewVersion } from "@langfuse/shared/query";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { BarListChartArea } from "@/src/features/dashboard/components/cards/BarListChartArea";
import { traceViewQuery } from "@/src/features/dashboard/lib/dashboard-utils";
import { useScheduledDashboardExecuteQuery } from "@/src/features/dashboard/hooks/useDashboardQueryScheduler";
import { cn } from "@/src/utils/tailwind";

// Cap on bars fetched and rendered; matches TracesBarListChart. The top list
// scrolls within the tile when they don't all fit.
const MAX_BARS = 20;

type BarChartDataPoint = {
  name: string;
  value: number;
};

export const UserChart = ({
  className,
  projectId,
  globalFilterState,
  fromTimestamp,
  toTimestamp,
  isLoading = false,
  metricsVersion,
  schedulerId,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  isLoading?: boolean;
  metricsVersion: ViewVersion;
  schedulerId?: string;
}) => {
  const userCostQuery: QueryType = {
    view: "observations",
    dimensions: [{ field: "userId" }],
    metrics: [
      { measure: "totalCost", aggregation: "sum" },
      { measure: "count", aggregation: "count" },
    ],
    filters: [
      ...mapLegacyUiTableFilterToView("observations", globalFilterState),
      {
        column: "type",
        operator: "any of",
        value: getGenerationLikeTypes(),
        type: "stringOptions",
      },
    ],
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: [{ field: "sum_totalCost", direction: "desc" }],
    chartConfig: {
      type: "HORIZONTAL_BAR",
      row_limit: MAX_BARS,
    },
  };

  const user = useScheduledDashboardExecuteQuery(
    {
      projectId,
      query: userCostQuery,
      version: metricsVersion,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      queryId: `${schedulerId ?? "home:users"}:cost`,
      enabled: !isLoading,
    },
  );

  const isV2 = metricsVersion === "v2";
  const countField = isV2 ? "uniq_traceId" : "count_count";

  const traceViewBase = traceViewQuery({ metricsVersion, globalFilterState });
  const traceMetric = traceViewBase.metrics[0] ?? {
    aggregation: "count",
    measure: "count",
  };
  const traceCountQuery: QueryType = {
    ...traceViewBase,
    dimensions: [{ field: "userId" }],
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: [
      {
        field: `${traceMetric.aggregation}_${traceMetric.measure}`,
        direction: "desc",
      },
    ],
    chartConfig: {
      type: "HORIZONTAL_BAR",
      row_limit: MAX_BARS,
    },
  };

  const traces = useScheduledDashboardExecuteQuery(
    {
      projectId,
      query: traceCountQuery,
      version: metricsVersion,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      queryId: `${schedulerId ?? "home:users"}:traces`,
      enabled: !isLoading,
    },
  );

  const transformedNumberOfTraces: BarChartDataPoint[] = traces.data
    ? traces.data
        .filter((item) => item.userId !== undefined)
        .map((item) => {
          return {
            name: item.userId as string,
            value: item[countField] ? Number(item[countField]) : 0,
          };
        })
    : [];

  const transformedCost: BarChartDataPoint[] = user.data
    ? user.data
        .filter((item) => item.userId !== undefined)
        .map((item) => {
          return {
            name: (item.userId as string | null | undefined) ?? "Unknown",
            value: item.sum_totalCost ? Number(item.sum_totalCost) : 0,
          };
        })
    : [];

  const totalCost = user.data?.reduce(
    (acc, curr) => acc + (Number(curr.sum_totalCost) || 0),
    0,
  );

  const totalTraces = traces.data?.reduce(
    (acc, curr) => acc + (Number(curr[countField]) || 0),
    0,
  );

  const data = [
    {
      tabTitle: "Token cost",
      data: transformedCost,
      totalMetric: costFormatter(totalCost),
      metricDescription: "Total cost",
      chartMetricLabel: "USD",
      chartUnit: "USD",
    },
    {
      tabTitle: "Count of Traces",
      data: transformedNumberOfTraces,
      totalMetric: totalTraces
        ? compactNumberFormatter(totalTraces)
        : compactNumberFormatter(0),
      metricDescription: "Total traces",
      chartMetricLabel: "Traces",
      chartUnit: "traces",
    },
  ] as const;

  return (
    <DashboardCard
      // h-full pins the card to the tile so the chart area gets the AVAILABLE
      // height, not its own content; min-h-0 lets the flex column shrink so
      // the top list scrolls internally.
      className={cn(className, "h-full")}
      cardContentClassName="min-h-0"
      title="User consumption"
      isLoading={isLoading || user.isPending}
    >
      <TabComponent
        tabs={data.map((item) => {
          return {
            tabTitle: item.tabTitle,
            content: (
              <>
                {item.data.length > 0 ? (
                  <div className="flex min-h-0 grow flex-col">
                    <TotalMetric
                      metric={item.totalMetric}
                      description={item.metricDescription}
                    />
                    <BarListChartArea
                      data={item.data}
                      maxBars={MAX_BARS}
                      metricLabel={item.chartMetricLabel}
                      unit={item.chartUnit}
                    />
                  </div>
                ) : (
                  <NoDataOrLoading
                    isLoading={isLoading || user.isPending}
                    description="Consumption per user is tracked by passing their ids on traces."
                    href="https://langfuse.com/docs/observability/features/users"
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
