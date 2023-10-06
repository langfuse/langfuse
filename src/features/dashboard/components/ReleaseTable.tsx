import Header from "@/src/components/layouts/header";
import { api } from "@/src/utils/api";
import { type FilterState } from "@/src/features/filters/types";
import { DashboardTable } from "./DashboardTable";
import { TotalMetric } from "./TotalMetric";

export const MetricTable = ({
  projectId,
  globalFilterState,
}: {
  projectId: string;
  globalFilterState: FilterState;
}) => {
  const metrics = api.dashboard.chart.useQuery({
    projectId,
    from: "traces_observations",
    select: [
      { column: "cost", agg: "SUM" },
      { column: "totalTokens", agg: "SUM" },
      { column: "model", agg: null },
    ],
    filter:
      globalFilterState.map((f) => ({
        ...f,
        column: "timestamp",
      })) ?? [],
    groupBy: [{ type: "string", column: "model" }],
    orderBy: [{ column: "cost", direction: "DESC", agg: "SUM" }],
    limit: null,
  });

  const totalTokens = metrics.data?.reduce(
    (acc, curr) =>
      acc + (curr.sumTotalTokens ? (curr.sumTotalTokens as number) : 0),
    0,
  );

  return (
    <DashboardTable
      title="Model costs"
      isLoading={metrics.isLoading}
      headers={["Model", "Total tokens", "Total cost (USD)"]}
      rows={[
        ["c", "d"],
        ["1", "2"],
        ["1", "2"],
      ]}
    >
      <TotalMetric
        metric={totalTokens?.toLocaleString() ?? "0"}
        description="Total tokens"
      />
    </DashboardTable>
  );
};
