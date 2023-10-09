import { api } from "@/src/utils/api";
import { type FilterState } from "@/src/features/filters/types";
import { TotalMetric } from "./TotalMetric";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";
import { DashboardTable } from "@/src/features/dashboard/components/cards/DashboardTable";
import { RightAlignedCell } from "@/src/features/dashboard/components/RightAlignedCell";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";

export const MetricTable = ({
  className,
  projectId,
  globalFilterState,
}: {
  className: string;
  projectId: string;
  globalFilterState: FilterState;
}) => {
  const localFilters = globalFilterState.map((f) => ({
    ...f,
    column: "timestamp",
  }));

  const metrics = api.dashboard.chart.useQuery({
    projectId,
    from: "traces_observations",
    select: [
      { column: "totalTokenCost" },
      { column: "totalTokens", agg: "SUM" },
      { column: "model" },
    ],
    filter: localFilters ?? [],
    groupBy: [{ type: "string", column: "model" }],
    orderBy: [{ column: "totalTokenCost", direction: "DESC" }],
  });

  const totalTokens = metrics.data?.reduce(
    (acc, curr) =>
      acc + (curr.totalTokenCost ? (curr.totalTokenCost as number) : 0),
    0,
  );

  const metricsData = metrics.data
    ? metrics.data
        .filter((item) => item.model !== null)
        .map((item, i) => [
          item.model as string,
          <RightAlignedCell key={i}>
            {item.sumTotalTokens
              ? numberFormatter(item.sumTotalTokens as number)
              : "0"}
          </RightAlignedCell>,
          <RightAlignedCell key={i}>
            {item.totalTokenCost
              ? usdFormatter(item.totalTokenCost as number)
              : "$0"}
          </RightAlignedCell>,
        ])
    : [];

  return (
    <DashboardCard
      className={className}
      title="Model costs"
      isLoading={metrics.isLoading}
    >
      <DashboardTable
        headers={[
          "Model",
          <RightAlignedCell key={1}>Total tokens</RightAlignedCell>,
          <RightAlignedCell key={1}>Total cost</RightAlignedCell>,
        ]}
        rows={metricsData}
        collapse={{ collapsed: 5, expanded: 20 }}
      >
        <TotalMetric
          metric={totalTokens ? usdFormatter(totalTokens) : "$0"}
          description="Total cost"
        />
      </DashboardTable>
    </DashboardCard>
  );
};
