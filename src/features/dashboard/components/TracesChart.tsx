import { api } from "@/src/utils/api";
import { type FilterState } from "@/src/features/filters/types";
import BarChartCard from "@/src/features/dashboard/components/cards/BarChartCard";
import { ExpandListButton } from "@/src/features/dashboard/components/cards/ChevronButton";
import { useState } from "react";

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
  const timeFilter =
    globalFilterState.map((f) =>
      f.type === "datetime" ? { ...f, column: "timestamp" } : f,
    ) ?? [];

  const totalTraces = api.dashboard.chart.useQuery({
    projectId,
    from: "traces",
    select: [{ column: "traceId", agg: "COUNT" }],
    filter: timeFilter,
  });

  const traces = api.dashboard.chart.useQuery({
    projectId,
    from: "traces",
    select: [{ column: "traceId", agg: "COUNT" }, { column: "traceName" }],
    filter: timeFilter,
    groupBy: [{ column: "traceName", type: "string" }],
    orderBy: [{ column: "traceId", direction: "DESC", agg: "COUNT" }],
  });

  const transformedTraces = traces.data
    ? traces.data.map((item) => {
        return {
          name: item.traceName ? (item.traceName as string) : "Unknown",
          value: item.countTraceId as number,
        };
      })
    : [];

  const maxNumberOfEntries = 5;

  const adjustedData = isExpanded
    ? transformedTraces
    : transformedTraces.slice(0, maxNumberOfEntries);

  return (
    <>
      <BarChartCard
        className={className}
        header={{
          metric: "Total traces tracked",
          stat: (totalTraces.data?.[0]?.countTraceId as number) ?? 0,
          category: "Traces",
        }}
        isLoading={traces.isLoading || totalTraces.isLoading}
        chart={{
          data: adjustedData,
          header: "Trace Name",
          metric: "Count",
        }}
      >
        <ExpandListButton
          isExpanded={isExpanded}
          setExpanded={setIsExpanded}
          totalLength={transformedTraces.length}
          maxLength={maxNumberOfEntries}
        />
      </BarChartCard>
    </>
  );
};
