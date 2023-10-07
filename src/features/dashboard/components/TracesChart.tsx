import { api } from "@/src/utils/api";
import { type FilterState } from "@/src/features/filters/types";
import BarChartCard from "@/src/features/dashboard/components/cards/BarChartCard";

export const TracesBarListChart = ({
  className,
  projectId,
  globalFilterState,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
}) => {
  const timeFilter =
    globalFilterState.map((f) =>
      f.type === "datetime" ? { ...f, column: "timestamp" } : f,
    ) ?? [];

  const totalTraces = api.dashboard.chart.useQuery({
    projectId,
    from: "traces",
    select: [{ column: "traceId", agg: "COUNT" }],
    filter: timeFilter,
    groupBy: [],
    orderBy: [],
    limit: null,
  });

  const traces = api.dashboard.chart.useQuery({
    projectId,
    from: "traces",
    select: [
      { column: "traceId", agg: "COUNT" },
      { column: "traceName", agg: null },
    ],
    filter: timeFilter,
    groupBy: [{ column: "traceName", type: "string" }],
    orderBy: [{ column: "traceId", direction: "DESC", agg: "COUNT" }],
    limit: 6,
  });

  const transformedTraces = traces.data
    ? traces.data.map((item) => {
        console.log(item.traceName, item.countTraceId);
        return {
          name: item.traceName ? (item.traceName as string) : "Unknown",
          value: item.countTraceId as number,
        };
      })
    : [];

  return (
    <BarChartCard
      className={className}
      header={{
        metric: "Traces tracked",
        stat: (totalTraces.data?.[0]?.countTraceId as number) ?? 0,
        category: "Traces",
      }}
      isLoading={traces.isLoading || totalTraces.isLoading}
      chart={{
        data: transformedTraces,
        header: "Trace Name",
        metric: "Count",
      }}
    />
  );
};
