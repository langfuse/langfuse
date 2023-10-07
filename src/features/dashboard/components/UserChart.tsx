import { api } from "@/src/utils/api";
import { type DateTimeAggregationOption } from "@/src/features/dashboard/lib/timeseries-aggregation";
import { type FilterState } from "@/src/features/filters/types";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";
import { TabComponent } from "@/src/features/dashboard/components/TabsComponent";
import { BarList } from "@tremor/react";
import { isNotUndefinedOrNull } from "@/src/utils/types";
import { type BarChartDataPoint } from "@/src/features/dashboard/components/cards/BarChartCard";

export const UserChart = ({
  className,
  projectId,
  globalFilterState,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  agg: DateTimeAggregationOption;
}) => {
  const user = api.dashboard.chart.useQuery({
    projectId,
    from: "traces_observations",
    select: [
      { column: "totalTokenCost", agg: null },
      { column: "user", agg: null },
      { column: "traceId", agg: "COUNT" },
    ],
    filter: globalFilterState ?? [],
    groupBy: [
      {
        type: "string",
        column: "user",
      },
    ],
    orderBy: [{ column: "totalTokenCost", agg: null, direction: "DESC" }],
    limit: null,
  });

  const traces = api.dashboard.chart.useQuery({
    projectId,
    from: "traces",
    select: [
      { column: "user", agg: null },
      { column: "traceId", agg: "COUNT" },
    ],
    filter:
      globalFilterState.map((f) => ({
        ...f,
        column: "timestamp",
      })) ?? [],
    groupBy: [
      {
        type: "string",
        column: "user",
      },
    ],
    orderBy: [{ column: "traceId", agg: "COUNT", direction: "DESC" }],
    limit: null,
  });

  const transformedNumberOfTraces: BarChartDataPoint[] = traces.data
    ? traces.data
        .filter((item) => item.user !== undefined)
        .map((item) => {
          return {
            name: item.user as string,
            value: item.countTraceId ? (item.countTraceId as number) : 0,
          };
        })
    : [];

  const transformedCost: BarChartDataPoint[] = user.data
    ? user.data
        .filter((item) => item.user !== undefined)
        .map((item) => {
          return {
            name: item.user as string,
            value: item.totalTokenCost ? (item.totalTokenCost as number) : 0,
          };
        })
        .filter((i) => (isNotUndefinedOrNull(i.name) ? true : false))
    : [];

  const totalCost = user.data?.reduce(
    (acc, curr) => acc + (curr.totalTokenCost as number),
    0,
  );

  const totalTraces = traces.data?.reduce(
    (acc, curr) => acc + (curr.countTraceId as number),
    0,
  );

  const data = [
    {
      tabTitle: "Token cost",
      data: transformedCost,
      totalMetric: totalCost ? usdFormatter(totalCost) : "-",
      metricDescription: "Total cost",
      formatter: usdFormatter,
    },
    {
      tabTitle: "Count of Traces",
      data: transformedNumberOfTraces,
      totalMetric: totalTraces ? numberFormatter(totalTraces) : "-",
      metricDescription: "Total traces",
    },
  ];

  return (
    <DashboardCard
      className={className}
      title={"User consumption"}
      isLoading={user.isLoading}
    >
      <TabComponent
        tabs={data.map((item) => {
          return {
            tabTitle: item.tabTitle,
            totalMetric: item.totalMetric,
            metricDescription: item.metricDescription,
            content: (
              <BarList
                data={item.data}
                valueFormatter={item.formatter}
                className="mt-2"
                showAnimation={true}
                color={"indigo"}
              />
            ),
          };
        })}
      />
    </DashboardCard>
  );
};
