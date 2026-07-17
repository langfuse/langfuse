import { type FilterState } from "@langfuse/shared";
import { ExpandListButton } from "@/src/features/dashboard/components/cards/ChevronButton";
import { useState } from "react";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { type QueryType, type ViewVersion } from "@langfuse/shared/query";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { formatMetric } from "@/src/features/widgets/chart-library/utils";
import { barListToDataPoints } from "@/src/features/dashboard/lib/chart-data-adapters";
import { traceViewQuery } from "@/src/features/dashboard/lib/dashboard-utils";
import { useScheduledDashboardExecuteQuery } from "@/src/hooks/useDashboardQueryScheduler";
import { useFitRowCount } from "@/src/features/dashboard/hooks/useFitRowCount";
import { cn } from "@/src/utils/tailwind";

// Target height of one bar row (bar + spacing) and the x-axis strip below the
// bars. Used both to decide how many bars fit and to size the expanded chart.
const BAR_ROW_HEIGHT = 40;
const CHART_AXIS_PADDING = 30;
// Cap on bars shown when expanded ("Show all"); the rest stay hidden.
const MAX_EXPANDED_BARS = 20;

export const TracesBarListChart = ({
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

  const isV2 = metricsVersion === "v2";
  const traceNameField = isV2 ? "traceName" : "name";
  const countField = isV2 ? "uniq_traceId" : "count_count";

  // Total traces query using executeQuery
  const totalTracesQuery: QueryType = {
    ...traceViewQuery({ metricsVersion, globalFilterState }),
    dimensions: [],
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  const totalTraces = useScheduledDashboardExecuteQuery(
    {
      projectId,
      query: totalTracesQuery,
      version: metricsVersion,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      queryId: `${schedulerId ?? "home:traces"}:total`,
      enabled: !isLoading,
    },
  );

  // Traces grouped by name query using executeQuery
  const tracesQuery: QueryType = {
    ...traceViewQuery({
      metricsVersion,
      globalFilterState,
      groupedByName: true,
    }),
    dimensions: [{ field: traceNameField }],
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: [{ field: countField, direction: "desc" }],
    chartConfig: { type: "table", row_limit: 20 },
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
      queryId: `${schedulerId ?? "home:traces"}:grouped`,
      enabled: !isLoading,
    },
  );

  // Transform the data to match the expected format for the BarList
  const transformedTraces =
    traces.data?.map((item: any) => {
      return {
        name: item[traceNameField]
          ? (item[traceNameField] as string)
          : "Unknown",
        value: Number(item[countField]),
      };
    }) ?? [];

  // Fit the number of bars to the tile height instead of a fixed count: the
  // collapsed view renders exactly as many bars as fill the measured chart area
  // (no scrollbar, no dead gap), and "Show all" reveals the rest. (LFE-11035)
  const { containerRef, rowCount, height } = useFitRowCount({
    rowHeightPx: BAR_ROW_HEIGHT,
    reservedPx: CHART_AXIS_PADDING,
    min: 1,
    fallback: 5,
  });

  const expandedCount = Math.min(MAX_EXPANDED_BARS, transformedTraces.length);
  const collapsedCount = Math.min(rowCount, transformedTraces.length);
  const adjustedData = transformedTraces.slice(
    0,
    isExpanded ? expandedCount : collapsedCount,
  );

  return (
    <DashboardCard
      // h-full (not just min-h-full) pins the card to the tile so the chart
      // area measures the AVAILABLE height, not its own content; min-h-0 on the
      // content lets the flex column shrink so the chart viewport does too and
      // scrolls internally instead of overflowing the tile. (LFE-11035)
      className={cn(className, "h-full")}
      cardContentClassName="min-h-0"
      title="Traces"
      description={null}
      isLoading={isLoading || traces.isPending || totalTraces.isPending}
    >
      <>
        <TotalMetric
          metric={compactNumberFormatter(
            totalTraces.data?.[0]?.[countField]
              ? Number(totalTraces.data[0][countField])
              : 0,
          )}
          description="Total traces tracked"
        />
        {transformedTraces.length > 0 ? (
          // The chart fills the leftover tile height (flex-1) and never forces
          // the card past its tile. Collapsed, it renders only the bars that fit
          // the measured area and sizes the chart to that same measured height,
          // so the bars spread to use it: a sparse list has no dead gap and a
          // full one has no scrollbar. Expanded, it grows to the bars' natural
          // height and this viewport scrolls within the tile. (LFE-11035,
          // revises LFE-10813)
          <div
            ref={containerRef}
            className="mt-4 min-h-0 w-full flex-1 overflow-y-auto"
          >
            <div
              className="w-full"
              style={{
                // Collapsed: fill the measured area exactly (definite px so
                // recharts renders and the bars spread to use the height).
                // Expanded: grow to the bars' natural height so the viewport
                // above scrolls.
                height: isExpanded
                  ? adjustedData.length * BAR_ROW_HEIGHT + CHART_AXIS_PADDING
                  : (height ?? 200),
              }}
            >
              <Chart
                chartType="HORIZONTAL_BAR"
                data={barListToDataPoints(adjustedData)}
                metricFormatter={(value) =>
                  formatMetric(value, { style: "full" })
                }
                config={{
                  metric: {
                    label: "Traces",
                  },
                }}
                rowLimit={MAX_EXPANDED_BARS}
                chartConfig={{
                  type: "HORIZONTAL_BAR",
                  row_limit: MAX_EXPANDED_BARS,
                  unit: "traces",
                  show_value_labels: true,
                }}
              />
            </div>
          </div>
        ) : (
          <NoDataOrLoading
            isLoading={isLoading || traces.isPending || totalTraces.isPending}
            description="Traces contain details about LLM applications and can be created using the SDK."
            href="https://langfuse.com/docs/get-started"
            className="h-auto grow"
          />
        )}
        <ExpandListButton
          isExpanded={isExpanded}
          setExpanded={setIsExpanded}
          totalLength={transformedTraces.length}
          maxLength={collapsedCount}
          expandText={
            transformedTraces.length > MAX_EXPANDED_BARS
              ? `Show top ${MAX_EXPANDED_BARS}`
              : "Show all"
          }
        />
      </>
    </DashboardCard>
  );
};
