/* eslint-disable @repo/no-style-props */
import { type FilterState } from "@langfuse/shared";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { type QueryType, type ViewVersion } from "@langfuse/shared/query";
import { formatMetric } from "@/src/features/widgets/chart-library/utils";
import { BarListChartArea } from "@/src/features/dashboard/components/cards/BarListChartArea";
import { traceViewQuery } from "@/src/features/dashboard/lib/dashboard-utils";
import { useScheduledDashboardExecuteQuery } from "@/src/features/dashboard/hooks/useDashboardQueryScheduler";
import { cn } from "@/src/utils/tailwind";

// Cap on bars fetched and rendered; the top list scrolls within the tile when
// they don't all fit.
const MAX_BARS = 20;

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
  metricsVersion: ViewVersion;
  schedulerId?: string;
}) => {
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
    chartConfig: { type: "table", row_limit: MAX_BARS },
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

  return (
    <DashboardCard
      // h-full pins the card to the tile so the chart area gets the AVAILABLE
      // height, not its own content; min-h-0 on the content lets the flex
      // column shrink so the top list scrolls internally instead of
      // overflowing the tile.
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
          <BarListChartArea
            data={transformedTraces}
            maxBars={MAX_BARS}
            metricLabel="Traces"
            unit="traces"
            metricFormatter={(value) => formatMetric(value, { style: "full" })}
          />
        ) : (
          <NoDataOrLoading
            isLoading={isLoading || traces.isPending || totalTraces.isPending}
            description="Traces contain details about LLM applications and can be created using the SDK."
            href="https://langfuse.com/docs/get-started"
            className="h-auto grow"
          />
        )}
      </>
    </DashboardCard>
  );
};
