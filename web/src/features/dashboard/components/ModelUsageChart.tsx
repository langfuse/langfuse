import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import {
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
  isEmptyTimeSeries,
} from "@/src/features/dashboard/components/hooks";
import { TabComponent } from "@/src/features/dashboard/components/TabsComponent";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { costFormatter } from "@/src/utils/numbers";
import { api } from "@/src/utils/api";
import {
  type DashboardDateRangeAggregationOption,
  dashboardDateRangeAggregationSettings,
} from "@/src/utils/date-range-utils";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { type FilterState, getGenerationLikeTypes } from "@langfuse/shared";
import {
  ModelSelectorPopover,
  useModelSelection,
} from "@/src/features/dashboard/components/ModelSelector";
import { type QueryType, type ViewVersion } from "@langfuse/shared/query";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";
import { DashboardLineTimeSeriesChart } from "@/src/features/dashboard/components/DashboardLineTimeSeriesChart";
import { useScheduledDashboardExecuteQuery } from "@/src/hooks/useDashboardQueryScheduler";
import { useMemo } from "react";

export const ModelUsageChart = ({
  className,
  projectId,
  globalFilterState,
  agg,
  fromTimestamp,
  toTimestamp,
  userAndEnvFilterState,
  isLoading = false,
  metricsVersion,
  schedulerId,
  syncId,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  agg: DashboardDateRangeAggregationOption;
  fromTimestamp: Date;
  toTimestamp: Date;
  userAndEnvFilterState: FilterState;
  isLoading?: boolean;
  metricsVersion?: ViewVersion;
  schedulerId?: string;
  syncId?: string;
}) => {
  const {
    allModels,
    selectedModels,
    setSelectedModels,
    isAllSelected,
    buttonText,
    handleSelectAll,
  } = useModelSelection(
    projectId,
    userAndEnvFilterState,
    fromTimestamp,
    toTimestamp,
    metricsVersion,
    {
      enabled: !isLoading,
      queryId: `${schedulerId ?? "home:model-usage"}:all-models`,
    },
  );
  const hasModelSelection = selectedModels.length > 0 && allModels.length > 0;
  const isModelUsageEnabled = !isLoading && hasModelSelection;

  const modelUsageQuery: QueryType = {
    view: "observations",
    dimensions: [{ field: "providedModelName" }],
    metrics: [
      { measure: "totalCost", aggregation: "sum" },
      { measure: "totalTokens", aggregation: "sum" },
    ],
    filters: [
      ...mapLegacyUiTableFilterToView("observations", userAndEnvFilterState),
      {
        column: "type",
        operator: "any of",
        value: getGenerationLikeTypes(),
        type: "stringOptions",
      },
      {
        column: "providedModelName",
        operator: "any of",
        value: selectedModels,
        type: "stringOptions",
      },
    ],
    timeDimension: {
      granularity:
        dashboardDateRangeAggregationSettings[agg].dateTrunc ?? "day",
    },
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  const queryResult = useScheduledDashboardExecuteQuery(
    {
      projectId,
      query: modelUsageQuery,
      version: metricsVersion,
    },
    {
      enabled: isModelUsageEnabled,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      queryId: `${schedulerId ?? "home:model-usage"}:timeseries`,
      priority: 1001,
    },
  );

  const queryCostByType = api.dashboard.chart.useQuery(
    {
      projectId,
      from: "traces_observations",
      select: [
        { column: "totalTokens", agg: "SUM" },
        { column: "calculatedTotalCost", agg: "SUM" },
        { column: "model" },
      ],
      filter: [
        ...globalFilterState,
        {
          type: "stringOptions",
          column: "type",
          operator: "any of",
          value: getGenerationLikeTypes(),
        },
        {
          type: "stringOptions",
          column: "model",
          operator: "any of",
          value: selectedModels,
        } as const,
      ],
      groupBy: [
        {
          type: "datetime",
          column: "startTime",
          temporalUnit:
            dashboardDateRangeAggregationSettings[agg].dateTrunc ?? "day",
        },
        {
          type: "string",
          column: "model",
        },
      ],
      orderBy: [
        { column: "calculatedTotalCost", direction: "DESC", agg: "SUM" },
      ],
      queryName: "observations-cost-by-type-timeseries",
      version: metricsVersion,
    },
    {
      enabled: isModelUsageEnabled,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const queryUsageByType = api.dashboard.chart.useQuery(
    {
      projectId,
      from: "traces_observations",
      select: [
        { column: "totalTokens", agg: "SUM" },
        { column: "calculatedTotalCost", agg: "SUM" },
        { column: "model" },
      ],
      filter: [
        ...globalFilterState,
        {
          type: "stringOptions",
          column: "type",
          operator: "any of",
          value: getGenerationLikeTypes(),
        },
        {
          type: "stringOptions",
          column: "model",
          operator: "any of",
          value: selectedModels,
        } as const,
      ],
      groupBy: [
        {
          type: "datetime",
          column: "startTime",
          temporalUnit:
            dashboardDateRangeAggregationSettings[agg].dateTrunc ?? "day",
        },
        {
          type: "string",
          column: "model",
        },
      ],
      orderBy: [{ column: "totalTokens", direction: "DESC", agg: "SUM" }],
      queryName: "observations-usage-by-type-timeseries",
      version: metricsVersion,
    },
    {
      enabled: isModelUsageEnabled,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  // Each series is memoized on its raw query result (+ model selection) so the
  // reference stays stable across the scheduler's page re-renders — that's what
  // lets the chart's React.memo bail. (LFE-10549)
  const costByType = useMemo(
    () =>
      queryCostByType.data && allModels.length > 0
        ? fillMissingValuesAndTransform(
            extractTimeSeriesData(queryCostByType.data, "intervalStart", [
              {
                uniqueIdentifierColumns: [{ accessor: "key" }],
                valueColumn: "sum",
              },
            ]),
            [],
          )
        : [],
    [queryCostByType.data, allModels],
  );

  const unitsByType = useMemo(
    () =>
      queryUsageByType.data && allModels.length > 0
        ? fillMissingValuesAndTransform(
            extractTimeSeriesData(queryUsageByType.data, "intervalStart", [
              {
                uniqueIdentifierColumns: [{ accessor: "key" }],
                valueColumn: "sum",
              },
            ]),
            [],
          )
        : [],
    [queryUsageByType.data, allModels],
  );

  const unitsByModel = useMemo(
    () =>
      queryResult.data && allModels.length > 0
        ? fillMissingValuesAndTransform(
            extractTimeSeriesData(
              queryResult.data as DatabaseRow[],
              "time_dimension",
              [
                {
                  uniqueIdentifierColumns: [{ accessor: "providedModelName" }],
                  valueColumn: "sum_totalTokens",
                },
              ],
            ),
            selectedModels,
          )
        : [],
    [queryResult.data, allModels, selectedModels],
  );

  const costByModel = useMemo(
    () =>
      queryResult.data && allModels.length > 0
        ? fillMissingValuesAndTransform(
            extractTimeSeriesData(
              queryResult.data as DatabaseRow[],
              "time_dimension",
              [
                {
                  uniqueIdentifierColumns: [{ accessor: "providedModelName" }],
                  valueColumn: "sum_totalCost",
                },
              ],
            ),
            selectedModels,
          )
        : [],
    [queryResult.data, allModels, selectedModels],
  );

  const totalCost = queryResult.data?.reduce(
    (acc, curr) =>
      acc +
      (!isNaN(Number(curr.sum_totalCost)) ? Number(curr.sum_totalCost) : 0),
    0,
  );

  const totalTokens = queryResult.data?.reduce(
    (acc, curr) =>
      acc +
      (!isNaN(Number(curr.sum_totalTokens)) ? Number(curr.sum_totalTokens) : 0),
    0,
  );

  const data = [
    {
      tabTitle: "Cost by model",
      data: costByModel,
      totalMetric: costFormatter(totalCost),
      metricDescription: `Cost`,
      chartMetricLabel: "USD",
      chartUnit: "USD",
    },
    {
      tabTitle: "Cost by type",
      data: costByType,
      totalMetric: costFormatter(totalCost),
      metricDescription: `Cost`,
      chartMetricLabel: "USD",
      chartUnit: "USD",
    },
    {
      tabTitle: "Usage by model",
      data: unitsByModel,
      totalMetric: totalTokens
        ? compactNumberFormatter(totalTokens)
        : compactNumberFormatter(0),
      metricDescription: `Units`,
      chartMetricLabel: "Tokens",
      chartUnit: "tokens",
    },
    {
      tabTitle: "Usage by type",
      data: unitsByType,
      totalMetric: totalTokens
        ? compactNumberFormatter(totalTokens)
        : compactNumberFormatter(0),
      metricDescription: `Units`,
      chartMetricLabel: "Tokens",
      chartUnit: "tokens",
    },
  ];

  return (
    <DashboardCard
      className={className}
      title="Model Usage"
      isLoading={
        isLoading || (queryResult.isPending && selectedModels.length > 0)
      }
      headerRight={
        <div className="flex items-center justify-end">
          <ModelSelectorPopover
            allModels={allModels}
            selectedModels={selectedModels}
            setSelectedModels={setSelectedModels}
            buttonText={buttonText}
            isAllSelected={isAllSelected}
            handleSelectAll={handleSelectAll}
          />
        </div>
      }
    >
      <TabComponent
        tabs={data.map((item) => {
          return {
            tabTitle: item.tabTitle,
            content: (
              <>
                <TotalMetric
                  metric={item.totalMetric}
                  description={item.metricDescription}
                  className="mb-4"
                />
                {isEmptyTimeSeries({ data: item.data }) ||
                isLoading ||
                queryResult.isPending ? (
                  <NoDataOrLoading
                    isLoading={isLoading || queryResult.isPending}
                  />
                ) : (
                  <div className="h-80 w-full shrink-0">
                    <DashboardLineTimeSeriesChart
                      data={item.data}
                      label={item.chartMetricLabel}
                      unit={item.chartUnit}
                      // Token/cost totals are additive sums. (LFE-10498)
                      legendSummary="sum"
                      syncId={syncId}
                    />
                  </div>
                )}
              </>
            ),
          };
        })}
      />
    </DashboardCard>
  );
};
