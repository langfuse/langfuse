import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import {
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
  isEmptyTimeSeries,
} from "@/src/features/dashboard/components/hooks";
import { TabComponent } from "@/src/features/dashboard/components/TabsComponent";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { totalCostDashboardFormatted } from "@/src/features/dashboard/lib/dashboard-utils";
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
import {
  type QueryType,
  type ViewVersion,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { timeSeriesToDataPoints } from "@/src/features/dashboard/lib/chart-data-adapters";
import { ChartLoadingState } from "@/src/features/widgets/chart-library/ChartLoadingState";
import { getChartLoadingStateProps } from "@/src/features/widgets/chart-library/chartLoadingStateUtils";

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
}) => {
  const {
    allModels,
    selectedModels,
    setSelectedModels,
    isAllSelected,
    buttonText,
    handleSelectAll,
    isAllModelsPending,
    isAllModelsError,
  } = useModelSelection(
    projectId,
    userAndEnvFilterState,
    fromTimestamp,
    toTimestamp,
    metricsVersion,
  );

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

  const queryResult = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: modelUsageQuery,
      version: metricsVersion,
    },
    {
      enabled: !isLoading && selectedModels.length > 0 && allModels.length > 0,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      meta: {
        silentHttpCodes: [422],
      },
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
      enabled: !isLoading && selectedModels.length > 0 && allModels.length > 0,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      meta: {
        silentHttpCodes: [422],
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
      enabled: !isLoading && selectedModels.length > 0 && allModels.length > 0,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      meta: {
        silentHttpCodes: [422],
      },
    },
  );

  const costByType =
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
      : [];

  const unitsByType =
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
      : [];

  const unitsByModel =
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
      : [];

  const costByModel =
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
      : [];

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
      totalMetric: totalCostDashboardFormatted(totalCost),
      metricDescription: `Cost`,
      formatter: totalCostDashboardFormatted,
      queryPending: isAllModelsPending || queryResult.isPending,
      queryError: isAllModelsError || queryResult.isError,
    },
    {
      tabTitle: "Cost by type",
      data: costByType,
      totalMetric: totalCostDashboardFormatted(totalCost),
      metricDescription: `Cost`,
      formatter: totalCostDashboardFormatted,
      queryPending: isAllModelsPending || queryCostByType.isPending,
      queryError: isAllModelsError || queryCostByType.isError,
    },
    {
      tabTitle: "Usage by model",
      data: unitsByModel,
      totalMetric: totalTokens
        ? compactNumberFormatter(totalTokens)
        : compactNumberFormatter(0),
      metricDescription: `Units`,
      queryPending: isAllModelsPending || queryResult.isPending,
      queryError: isAllModelsError || queryResult.isError,
    },
    {
      tabTitle: "Usage by type",
      data: unitsByType,
      totalMetric: totalTokens
        ? compactNumberFormatter(totalTokens)
        : compactNumberFormatter(0),
      metricDescription: `Units`,
      queryPending: isAllModelsPending || queryUsageByType.isPending,
      queryError: isAllModelsError || queryUsageByType.isError,
    },
  ];

  return (
    <DashboardCard
      className={className}
      title="Model Usage"
      isLoading={false}
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
          const tabLoadingState = getChartLoadingStateProps({
            isPending: isLoading || item.queryPending,
            isError: item.queryError,
          });

          return {
            tabTitle: item.tabTitle,
            content: (
              <>
                <TotalMetric
                  metric={item.totalMetric}
                  description={item.metricDescription}
                  className="mb-4"
                />
                {!isEmptyTimeSeries({ data: item.data }) ? (
                  <div className="relative h-80 w-full shrink-0">
                    <Chart
                      chartType="LINE_TIME_SERIES"
                      data={timeSeriesToDataPoints(item.data, agg)}
                      rowLimit={100}
                      chartConfig={{
                        type: "LINE_TIME_SERIES",
                        show_data_point_dots: false,
                      }}
                      valueFormatter={item.formatter}
                      legendPosition="above"
                    />
                    <ChartLoadingState
                      isLoading={tabLoadingState.isLoading}
                      showSpinner={tabLoadingState.showSpinner}
                      showHintImmediately={tabLoadingState.showHintImmediately}
                      hintText={tabLoadingState.hintText}
                      className="absolute inset-0 z-20 bg-background/80 backdrop-blur-sm"
                      hintClassName="max-w-sm px-4"
                    />
                  </div>
                ) : tabLoadingState.isLoading ? (
                  <div className="relative h-80 w-full shrink-0">
                    <ChartLoadingState
                      isLoading={tabLoadingState.isLoading}
                      showSpinner={tabLoadingState.showSpinner}
                      showHintImmediately={tabLoadingState.showHintImmediately}
                      hintText={tabLoadingState.hintText}
                      className="absolute inset-0 z-20 bg-background/80 backdrop-blur-sm"
                      hintClassName="max-w-sm px-4"
                    />
                  </div>
                ) : (
                  <NoDataOrLoading isLoading={false} />
                )}
              </>
            ),
          };
        })}
      />
    </DashboardCard>
  );
};
