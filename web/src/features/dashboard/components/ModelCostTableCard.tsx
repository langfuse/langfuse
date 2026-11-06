/* eslint-disable @repo/no-style-props */
import {
  DataCard,
  type DataCardActions,
} from "@/src/components/design-system/DataCard/DataCard";
import { type FilterState, getGenerationLikeTypes } from "@langfuse/shared";
import { compactNumberFormatter, costFormatter } from "@/src/utils/numbers";

import { type QueryType, type ViewVersion } from "@langfuse/shared/query";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { useScheduledDashboardExecuteQuery } from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";
import { cn } from "@/src/utils/tailwind";
import DocPopup from "@/src/components/layouts/doc-popup";

export const ModelCostTableCard = ({
  actions,
  className,
  projectId,
  globalFilterState,
  fromTimestamp,
  toTimestamp,
  isLoading = false,
  metricsVersion,
  schedulerId,
}: {
  actions?: DataCardActions;
  className: string;
  projectId: string;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  isLoading?: boolean;
  metricsVersion: ViewVersion;
  schedulerId?: string;
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
        operator: "any of",
        value: getGenerationLikeTypes(),
        type: "stringOptions",
      },
    ],
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: [{ field: "sum_totalCost", direction: "desc" }],
    chartConfig: { type: "table", row_limit: 20 },
  };

  const metrics = useScheduledDashboardExecuteQuery(
    {
      projectId,
      query: modelCostQuery,
      version: metricsVersion,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      queryId: `${schedulerId ?? "home:model-costs"}:metrics`,
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
        .map((item) => ({
          id: String(item.providedModelName),
          cells: [
            {
              columnId: "model",
              value: String(item.providedModelName),
              title: String(item.providedModelName),
              truncateAt: 30,
            },
            {
              columnId: "tokens",
              value: item.sum_totalTokens
                ? compactNumberFormatter(item.sum_totalTokens as number)
                : "0",
            },
            {
              columnId: "cost",
              value: item.sum_totalCost
                ? costFormatter(item.sum_totalCost as number)
                : "$0",
            },
          ],
        }))
    : [];

  return (
    <div className={cn(className, "h-full")}>
      <DocPopup
        description="Calculated multiplying the number of tokens with cost per token for each model."
        href="https://langfuse.com/docs/model-usage-and-cost"
      >
        {({ getTriggerProps }) => (
          <DataCard
            actions={actions}
            title="Model costs"
            content={(() => {
              const columns = [
                { id: "model", label: "Model" },
                { id: "tokens", label: "Tokens", align: "right" as const },
                { id: "cost", label: "USD", align: "right" as const },
              ];
              if (isLoading || metrics.isPending)
                return {
                  type: "loading",
                  skeleton: "table",
                  columns,
                  collapse: { collapsed: 5, expanded: 20 },
                  progress: { type: "spinner" },
                };
              if (!metricsData.length) return { type: "empty" };
              return {
                type: "table",
                columns,
                rows: metricsData,
                collapse: { collapsed: 5, expanded: 20 },
              };
            })()}
            metric={{
              value: costFormatter(totalTokenCost),
              description: "Total cost",
              documentation: getTriggerProps(),
            }}
          />
        )}
      </DocPopup>
    </div>
  );
};
