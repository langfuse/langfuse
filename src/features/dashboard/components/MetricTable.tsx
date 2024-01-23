import DocPopup from "@/src/components/layouts/doc-popup";
import { RightAlignedCell } from "@/src/features/dashboard/components/RightAlignedCell";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { DashboardTable } from "@/src/features/dashboard/components/cards/DashboardTable";
import { type FilterState } from "@/src/features/filters/types";
import { api } from "@/src/utils/api";
import { compactNumberFormatter, usdFormatter } from "@/src/utils/numbers";
import { TotalMetric } from "./TotalMetric";

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

  const metrics = api.dashboard.chart.useQuery(
    {
      projectId,
      from: "traces_observations",
      select: [
        { column: "calculatedTotalCost", agg: "SUM" },
        { column: "totalTokens", agg: "SUM" },
        { column: "model" },
      ],
      filter: localFilters,
      groupBy: [{ type: "string", column: "internalModel" }],
      orderBy: [
        { column: "calculatedTotalCost", direction: "DESC", agg: "SUM" },
      ],
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const totalTokens = metrics.data?.reduce(
    (acc, curr) =>
      acc +
      (curr.sumCalculatedTotalCost
        ? (curr.sumCalculatedTotalCost as number)
        : 0),
    0,
  );

  const metricsData = metrics.data
    ? metrics.data
        .filter((item) => item.internalModel !== null)
        .map((item, i) => [
          item.internalModel as string,
          <RightAlignedCell key={`${i}-tokens`}>
            {item.sumTotalTokens
              ? compactNumberFormatter(item.sumTotalTokens as number)
              : "0"}
          </RightAlignedCell>,
          <RightAlignedCell key={`${i}-cost`}>
            {item.sumCalculatedTotalCost
              ? usdFormatter(item.sumCalculatedTotalCost as number, 2, 2)
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
          <RightAlignedCell key="tokens">Tokens</RightAlignedCell>,
          <RightAlignedCell key="cost">USD</RightAlignedCell>,
        ]}
        rows={metricsData}
        collapse={{ collapsed: 5, expanded: 20 }}
      >
        <TotalMetric
          metric={totalTokens ? usdFormatter(totalTokens, 2, 2) : "$0"}
          description="Total cost"
        >
          <DocPopup
            description="Calculated multiplying the number of tokens with cost per token for each model."
            href="https://langfuse.com/docs/token-usage"
          />
        </TotalMetric>
      </DashboardTable>
    </DashboardCard>
  );
};
