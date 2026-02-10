import { api } from "@/src/utils/api";
import { type FilterState } from "@langfuse/shared";
import { ExpandListButton } from "@/src/features/dashboard/components/cards/ChevronButton";
import { useState } from "react";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { BarList } from "@tremor/react";
import { compactNumberFormatter, numberFormatter } from "@/src/utils/numbers";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import {
  type QueryType,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { barListToDataPoints } from "@/src/features/dashboard/lib/tremorv4-recharts-chart-adapters";

export const TracesBarListChart = ({
  className,
  projectId,
  globalFilterState,
  fromTimestamp,
  toTimestamp,
  isLoading = false,
  isDashboardChartsBeta = false,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  isLoading?: boolean;
  isDashboardChartsBeta?: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Total traces query using executeQuery
  const totalTracesQuery: QueryType = {
    view: "traces",
    dimensions: [],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: mapLegacyUiTableFilterToView("traces", globalFilterState),
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  const totalTraces = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: totalTracesQuery,
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

  // Traces grouped by name query using executeQuery
  const tracesQuery: QueryType = {
    view: "traces",
    dimensions: [{ field: "name" }],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: mapLegacyUiTableFilterToView("traces", globalFilterState),
    timeDimension: null,
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

  // Transform the data to match the expected format for the BarList
  const transformedTraces =
    traces.data?.map((item: any) => {
      return {
        name: item.name ? (item.name as string) : "Unknown",
        value: Number(item.count_count),
      };
    }) ?? [];

  const maxNumberOfEntries = { collapsed: 5, expanded: 20 };

  const adjustedData = isExpanded
    ? transformedTraces.slice(0, maxNumberOfEntries.expanded)
    : transformedTraces.slice(0, maxNumberOfEntries.collapsed);

  // Height scales with bar count so each bar keeps the same height when expanding, otherwise recharts chart would resize to fit into the container.
  const BAR_ROW_HEIGHT = 36;
  const CHART_AXIS_PADDING = 32;

  return (
    <DashboardCard
      className={className}
      title={"Traces"}
      description={null}
      isLoading={isLoading || traces.isPending || totalTraces.isPending}
    >
      <>
        <TotalMetric
          metric={compactNumberFormatter(
            totalTraces.data?.[0]?.count_count
              ? Number(totalTraces.data[0].count_count)
              : 0,
          )}
          description={"Total traces tracked"}
        />
        {adjustedData.length > 0 ? (
          <>
            {isDashboardChartsBeta ? (
              <div
                className="mt-4 w-full"
                style={{
                  minHeight: 200,
                  height: Math.max(
                    200,
                    adjustedData.length * BAR_ROW_HEIGHT + CHART_AXIS_PADDING,
                  ),
                }}
              >
                <Chart
                  chartType="HORIZONTAL_BAR"
                  data={barListToDataPoints(adjustedData)}
                  rowLimit={maxNumberOfEntries.expanded}
                  chartConfig={{
                    type: "HORIZONTAL_BAR",
                    row_limit: maxNumberOfEntries.expanded,
                    subtle_fill: true,
                    show_value_labels: true,
                  }}
                  valueFormatter={(n) => numberFormatter(n, 0)}
                />
              </div>
            ) : (
              <BarList
                data={adjustedData}
                valueFormatter={(number: number) => numberFormatter(number, 0)}
                className="mt-6 [&_*]:text-muted-foreground [&_p]:text-muted-foreground [&_span]:text-muted-foreground"
                showAnimation={true}
                color={"indigo"}
              />
            )}
          </>
        ) : (
          <NoDataOrLoading
            isLoading={isLoading || traces.isPending || totalTraces.isPending}
            description="Traces contain details about LLM applications and can be created using the SDK."
            href="https://langfuse.com/docs/get-started"
          />
        )}
        <ExpandListButton
          isExpanded={isExpanded}
          setExpanded={setIsExpanded}
          totalLength={transformedTraces.length}
          maxLength={maxNumberOfEntries.collapsed}
          expandText={
            transformedTraces.length > maxNumberOfEntries.expanded
              ? `Show top ${maxNumberOfEntries.expanded}`
              : "Show all"
          }
        />
      </>
    </DashboardCard>
  );
};
