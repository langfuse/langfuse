import DocPopup from "@/src/components/layouts/doc-popup";
import { RightAlignedCell } from "@/src/features/dashboard/components/RightAlignedCell";
import { LeftAlignedCell } from "@/src/features/dashboard/components/LeftAlignedCell";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { DashboardTable } from "@/src/features/dashboard/components/cards/DashboardTable";
import { type FilterState } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { TotalMetric } from "./TotalMetric";
import { totalCostDashboardFormatted } from "@/src/features/dashboard/lib/dashboard-utils";
import { truncate } from "@/src/utils/string";
import {
  type QueryType,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";

export const ModelCostTable = ({
  className,
  projectId,
  globalFilterState,
  fromTimestamp,
  toTimestamp,
  isLoading = false,
}: {
  className: string;
  projectId: string;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  isLoading?: boolean;
}) => {
  const modelCostQuery: QueryType = {
    view: "observations",
    dimensions: [{ field: "providedModelName" }],
    metrics: [
      { measure: "totalCost", aggregation: "sum" },
      { measure: "totalTokens", aggregation: "sum" },
    ],
    filters: [
      ...mapLegacyUiTableFilterToView("observations", globalFilterState),
      {
        column: "type",
        operator: "=",
        value: "GENERATION",
        type: "string",
      },
    ],
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  const metrics = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: modelCostQuery,
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

  const totalTokenCost = metrics.data?.reduce(
    (acc, curr) =>
      acc + (curr.sum_totalCost ? (curr.sum_totalCost as number) : 0),
    0,
  );

  const metricsData = metrics.data
    ? metrics.data
        .filter((item) => item.providedModelName !== null)
        .map((item, i) => [
          <LeftAlignedCell
            key={`${i}-model`}
            title={item.providedModelName as string}
          >
            {truncate(item.providedModelName as string, 30)}
          </LeftAlignedCell>,
          <RightAlignedCell key={`${i}-tokens`}>
            {item.sum_totalTokens
              ? compactNumberFormatter(item.sum_totalTokens as number)
              : "0"}
          </RightAlignedCell>,
          <RightAlignedCell key={`${i}-cost`}>
            {item.sum_totalCost
              ? totalCostDashboardFormatted(item.sum_totalCost as number)
              : "$0"}
          </RightAlignedCell>,
        ])
    : [];

  return (
    <DashboardCard
      className={className}
      title="Model costs"
      isLoading={isLoading || metrics.isLoading}
    >
      <DashboardTable
        headers={[
          "Model",
          <RightAlignedCell key="tokens">Tokens</RightAlignedCell>,
          <RightAlignedCell key="cost">USD</RightAlignedCell>,
        ]}
        rows={metricsData}
        isLoading={isLoading || metrics.isLoading}
        collapse={{ collapsed: 5, expanded: 20 }}
      >
        <TotalMetric
          metric={totalCostDashboardFormatted(totalTokenCost)}
          description="Total cost"
        >
          <DocPopup
            description="Calculated multiplying the number of tokens with cost per token for each model."
            href="https://langfuse.com/docs/model-usage-and-cost"
          />
        </TotalMetric>
      </DashboardTable>
    </DashboardCard>
  );
};
