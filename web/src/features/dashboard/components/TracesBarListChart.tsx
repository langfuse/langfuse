import { api } from "@/src/utils/api";
import { type FilterState } from "@langfuse/shared";
import { ExpandListButton } from "@/src/features/dashboard/components/cards/ChevronButton";
import { useState } from "react";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { compactNumberFormatter, numberFormatter } from "@/src/utils/numbers";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { type QueryType, type ViewVersion } from "@/src/features/query";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { barListToDataPoints } from "@/src/features/dashboard/lib/chart-data-adapters";
import { traceViewQuery } from "@/src/features/dashboard/lib/dashboard-utils";

export const TracesBarListChart = ({
  className,
  projectId,
  globalFilterState,
  fromTimestamp,
  toTimestamp,
  isLoading = false,
  metricsVersion,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  isLoading?: boolean;
  metricsVersion?: ViewVersion;
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

  const totalTraces = api.dashboard.executeQuery.useQuery(
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

  const traces = api.dashboard.executeQuery.useQuery(
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
            totalTraces.data?.[0]?.[countField]
              ? Number(totalTraces.data[0][countField])
              : 0,
          )}
          description={"Total traces tracked"}
        />
        {adjustedData.length > 0 ? (
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
