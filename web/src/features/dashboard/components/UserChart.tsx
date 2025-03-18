import { api } from "@/src/utils/api";
import { type FilterState } from "@langfuse/shared";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { TabComponent } from "@/src/features/dashboard/components/TabsComponent";
import { BarList } from "@tremor/react";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { ExpandListButton } from "@/src/features/dashboard/components/cards/ChevronButton";
import { useState } from "react";
import {
  createTracesTimeFilter,
  totalCostDashboardFormatted,
} from "@/src/features/dashboard/lib/dashboard-utils";
import { env } from "@/src/env.mjs";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";

type BarChartDataPoint = {
  name: string;
  value: number;
};

export const UserChart = ({
  className,
  projectId,
  globalFilterState,
  isLoading = false,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  isLoading?: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const user = api.dashboard.chart.useQuery(
    {
      projectId,
      from: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION // Langfuse Cloud has already completed the cost backfill job, thus cost can be pulled directly from obs. table
        ? "traces_observations"
        : "traces_observationsview",
      select: [
        { column: "calculatedTotalCost", agg: "SUM" },
        { column: "user" },
        { column: "traceId", agg: "COUNT" },
      ],
      filter: [
        ...globalFilterState,
        {
          type: "string",
          column: "type",
          operator: "=",
          value: "GENERATION",
        },
      ],
      groupBy: [
        {
          type: "string",
          column: "user",
        },
      ],
      orderBy: [
        { column: "calculatedTotalCost", direction: "DESC", agg: "SUM" },
      ],
      queryName: "observations-usage-by-users",
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

  const traces = api.dashboard.chart.useQuery(
    {
      projectId,
      from: "traces",
      select: [{ column: "user" }, { column: "traceId", agg: "COUNT" }],
      filter: createTracesTimeFilter(globalFilterState),
      groupBy: [
        {
          type: "string",
          column: "user",
        },
      ],
      orderBy: [{ column: "traceId", agg: "COUNT", direction: "DESC" }],
      queryName: "traces-grouped-by-user",
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
            name: (item.user as string | null | undefined) ?? "Unknown",
            value: item.sumCalculatedTotalCost
              ? (item.sumCalculatedTotalCost as number)
              : 0,
          };
        })
    : [];

  const totalCost = user.data?.reduce(
    (acc, curr) => acc + (curr.sumCalculatedTotalCost as number),
    0,
  );

  const totalTraces = traces.data?.reduce(
    (acc, curr) => acc + (curr.countTraceId as number),
    0,
  );

  const maxNumberOfEntries = { collapsed: 5, expanded: 20 } as const;

  const localUsdFormatter = (value: number) =>
    totalCostDashboardFormatted(value);

  const data = [
    {
      tabTitle: "Token cost",
      data: isExpanded
        ? transformedCost.slice(0, maxNumberOfEntries.expanded)
        : transformedCost.slice(0, maxNumberOfEntries.collapsed),
      totalMetric: totalCostDashboardFormatted(totalCost),
      metricDescription: "Total cost",
      formatter: localUsdFormatter,
    },
    {
      tabTitle: "Count of Traces",
      data: isExpanded
        ? transformedNumberOfTraces.slice(0, maxNumberOfEntries.expanded)
        : transformedNumberOfTraces.slice(0, maxNumberOfEntries.collapsed),
      totalMetric: totalTraces
        ? compactNumberFormatter(totalTraces)
        : compactNumberFormatter(0),
      metricDescription: "Total traces",
    },
  ];

  return (
    <DashboardCard
      className={className}
      title="User consumption"
      isLoading={isLoading || user.isLoading}
    >
      <TabComponent
        tabs={data.map((item) => {
          return {
            tabTitle: item.tabTitle,
            content: (
              <>
                {item.data.length > 0 ? (
                  <>
                    <TotalMetric
                      metric={item.totalMetric}
                      description={item.metricDescription}
                    />
                    <BarList
                      data={item.data}
                      valueFormatter={item.formatter}
                      className="mt-2"
                      showAnimation={true}
                      color={"indigo"}
                    />
                  </>
                ) : (
                  <NoDataOrLoading
                    isLoading={isLoading || user.isLoading}
                    description="Consumption per user is tracked by passing their ids on traces."
                    href="https://langfuse.com/docs/tracing-features/users"
                  />
                )}
              </>
            ),
          };
        })}
      />
      <ExpandListButton
        isExpanded={isExpanded}
        setExpanded={setIsExpanded}
        totalLength={transformedCost.length}
        maxLength={maxNumberOfEntries.collapsed}
        expandText={
          transformedCost.length > maxNumberOfEntries.expanded
            ? `Show top ${maxNumberOfEntries.expanded}`
            : "Show all"
        }
      />
    </DashboardCard>
  );
};
