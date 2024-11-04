import { api } from "@/src/utils/api";
import { type FilterState } from "@langfuse/shared";
import { ExpandListButton } from "@/src/features/dashboard/components/cards/ChevronButton";
import { useState } from "react";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { BarList } from "@tremor/react";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { useClickhouse } from "@/src/components/layouts/ClickhouseAdminToggle";

export const TracesBarListChart = ({
  className,
  projectId,
  globalFilterState,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const timeFilter = globalFilterState.map((f) =>
    f.type === "datetime" ? { ...f, column: "timestamp" } : f,
  );

  const totalTraces = api.dashboard.chart.useQuery(
    {
      projectId,
      from: "traces",
      select: [{ column: "traceId", agg: "COUNT" }],
      filter: timeFilter,
      queryClickhouse: useClickhouse(),
      queryName: "traces-total",
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const traces = api.dashboard.chart.useQuery(
    {
      projectId,
      from: "traces",
      select: [{ column: "traceId", agg: "COUNT" }, { column: "traceName" }],
      filter: timeFilter,
      groupBy: [{ column: "traceName", type: "string" }],
      orderBy: [{ column: "traceId", direction: "DESC", agg: "COUNT" }],
      queryClickhouse: useClickhouse(),
      queryName: "traces-grouped-by-name",
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const transformedTraces = traces.data
    ? traces.data.map((item) => {
        return {
          name: item.traceName ? (item.traceName as string) : "Unknown",
          value: item.countTraceId as number,
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
      isLoading={traces.isLoading || totalTraces.isLoading}
    >
      <>
        <TotalMetric
          metric={compactNumberFormatter(
            totalTraces.data?.[0]?.countTraceId as number,
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
            isLoading={traces.isLoading || totalTraces.isLoading}
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
