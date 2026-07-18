import { type FilterState, getGenerationLikeTypes } from "@langfuse/shared";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { TabComponent } from "@/src/features/dashboard/components/TabsComponent";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { ExpandListButton } from "@/src/features/dashboard/components/cards/ChevronButton";
import { useState } from "react";
import { costFormatter } from "@/src/utils/numbers";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { type QueryType, type ViewVersion } from "@langfuse/shared/query";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { barListToDataPoints } from "@/src/features/dashboard/lib/chart-data-adapters";
import { traceViewQuery } from "@/src/features/dashboard/lib/dashboard-utils";
import { useScheduledDashboardExecuteQuery } from "@/src/hooks/useDashboardQueryScheduler";
import { useFitRowCount } from "@/src/features/dashboard/hooks/useFitRowCount";
import { cn } from "@/src/utils/tailwind";

// Target height of one bar row (bar + spacing) and the x-axis strip; matches
// TracesBarListChart so bars are the same thickness across the two cards.
const BAR_ROW_HEIGHT = 40;
const CHART_AXIS_PADDING = 30;

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
  metricsVersion?: ViewVersion;
  schedulerId?: string;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const maxNumberOfEntries = { collapsed: 5, expanded: 20 } as const;

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
      row_limit: maxNumberOfEntries.expanded,
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
      row_limit: maxNumberOfEntries.expanded,
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

  // Fit the number of bars to the tile height (see TracesBarListChart): render
  // exactly the bars that fill the measured chart area, no scrollbar, and defer
  // the rest to "Show all". (LFE-11035)
  const { containerRef, rowCount, height } = useFitRowCount({
    rowHeightPx: BAR_ROW_HEIGHT,
    reservedPx: CHART_AXIS_PADDING,
    min: 1,
    fallback: maxNumberOfEntries.collapsed,
  });

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
      // h-full pins the card to the tile so the chart area measures the
      // AVAILABLE height, not its own content; min-h-0 lets the flex column
      // shrink so the chart viewport scrolls internally. (LFE-11035)
      className={cn(className, "h-full")}
      cardContentClassName="min-h-0"
      title="User consumption"
      isLoading={isLoading || user.isPending}
    >
      <TabComponent
        tabs={data.map((item) => {
          const shown = item.data.slice(
            0,
            isExpanded
              ? Math.min(maxNumberOfEntries.expanded, item.data.length)
              : Math.min(rowCount, item.data.length),
          );
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
                    {/* The chart fills the leftover tile height. Collapsed it
                        renders only the bars that fit the measured area and
                        sizes the chart to that same height, so they spread to
                        use it: no dead gap for a sparse list, no scrollbar for a
                        full one. Expanded it grows to the bars' natural height
                        and this viewport scrolls within the tile. Mirrors
                        TracesBarListChart. (LFE-11035, revises LFE-10813) */}
                    <div
                      ref={containerRef}
                      className="mt-4 min-h-0 w-full flex-1 overflow-y-auto"
                    >
                      <div
                        className="w-full"
                        style={{
                          // Collapsed: fill the measured area (definite px).
                          // Expanded: grow to the bars' natural height so the
                          // viewport scrolls.
                          height: isExpanded
                            ? shown.length * BAR_ROW_HEIGHT + CHART_AXIS_PADDING
                            : (height ?? 200),
                        }}
                      >
                        <Chart
                          chartType="HORIZONTAL_BAR"
                          data={barListToDataPoints(shown)}
                          config={{
                            metric: {
                              label: item.chartMetricLabel,
                            },
                          }}
                          rowLimit={maxNumberOfEntries.expanded}
                          chartConfig={{
                            type: "HORIZONTAL_BAR",
                            row_limit: maxNumberOfEntries.expanded,
                            unit: item.chartUnit,
                            show_value_labels: true,
                          }}
                        />
                      </div>
                    </div>
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
      <ExpandListButton
        isExpanded={isExpanded}
        setExpanded={setIsExpanded}
        totalLength={transformedCost.length}
        maxLength={Math.min(rowCount, transformedCost.length)}
        expandText={
          transformedCost.length > maxNumberOfEntries.expanded
            ? `Show top ${maxNumberOfEntries.expanded}`
            : "Show all"
        }
      />
    </DashboardCard>
  );
};
