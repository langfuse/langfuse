import { api } from "@/src/utils/api";
import { type FilterState } from "@langfuse/shared";
import { ExpandListButton } from "@/src/features/dashboard/components/cards/ChevronButton";
import { useState } from "react";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { BarList } from "@tremor/react";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { type QueryType } from "@/src/features/query/types";

export const TracesBarListChart = ({
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

  // Extract datetime filters to use for fromTimestamp and toTimestamp
  // and collect the remaining filters.
  // Initialize a 1d window.
  let fromTimestamp = new Date(
    new Date().getTime() - 24 * 60 * 60 * 1000,
  ).toISOString();
  let toTimestamp = new Date().toISOString();
  const filters: FilterState = [];

  // Process each filter
  globalFilterState.forEach((filter) => {
    if (
      filter.type === "datetime" &&
      (filter.column === "timestamp" || filter.column === "startTime")
    ) {
      // Extract timestamp filters
      if (filter.operator === ">=" || filter.operator === ">") {
        fromTimestamp = filter.value.toISOString();
      } else if (filter.operator === "<=" || filter.operator === "<") {
        toTimestamp = filter.value.toISOString();
      }
    } else {
      // Keep all other filters
      filters.push(filter);
    }
  });

  // Total traces query using executeQuery
  const totalTracesQuery: QueryType = {
    view: "traces",
    dimensions: [],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters,
    timeDimension: null,
    fromTimestamp,
    toTimestamp,
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
    filters,
    timeDimension: null,
    fromTimestamp,
    toTimestamp,
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
  const transformedTraces = traces.data?.data
    ? traces.data.data.map((item: any) => {
        return {
          name: item.name ? (item.name as string) : "Unknown",
          value: Number(item.count_count),
        };
      })
    : [];

  const maxNumberOfEntries = { collapsed: 5, expanded: 20 };

  const adjustedData = isExpanded
    ? transformedTraces.slice(0, maxNumberOfEntries.expanded)
    : transformedTraces.slice(0, maxNumberOfEntries.collapsed);

  return (
    <DashboardCard
      className={className}
      title={"Traces"}
      description={null}
      isLoading={isLoading || traces.isLoading || totalTraces.isLoading}
    >
      <>
        <TotalMetric
          metric={compactNumberFormatter(
            totalTraces.data?.data?.[0]?.count_count
              ? Number(totalTraces.data.data[0].count_count)
              : 0,
          )}
          description={"Total traces tracked"}
        />
        {adjustedData.length > 0 ? (
          <>
            <BarList
              data={adjustedData}
              valueFormatter={(number: number) =>
                Intl.NumberFormat("en-US").format(number).toString()
              }
              className="mt-6"
              showAnimation={true}
              color={"indigo"}
            />
          </>
        ) : (
          <NoDataOrLoading
            isLoading={isLoading || traces.isLoading || totalTraces.isLoading}
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
