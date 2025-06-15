import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
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
import { type FilterState } from "@langfuse/shared";
import {
  ModelSelectorPopover,
  useModelSelection,
} from "@/src/features/dashboard/components/ModelSelector";
import {
  type QueryType,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";

export const ModelUsageChart = ({
  className,
  projectId,
  globalFilterState,
  agg,
  fromTimestamp,
  toTimestamp,
  userAndEnvFilterState,
  isLoading = false,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  agg: DashboardDateRangeAggregationOption;
  fromTimestamp: Date;
  toTimestamp: Date;
  userAndEnvFilterState: FilterState;
  isLoading?: boolean;
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
        operator: "=",
        value: "GENERATION",
        type: "string",
      },
      {
        column: "providedModelName",
        operator: "any of",
        value: selectedModels,
        type: "stringOptions",
      },
    ],
    timeDimension: {
      granularity: dashboardDateRangeAggregationSettings[agg].date_trunc,
    },
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  const queryResult = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: modelUsageQuery,
    },
    {
      enabled: !isLoading && selectedModels.length > 0 && allModels.length > 0,
      trpc: {
        context: {
          skipBatch: true,
        },
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
        { type: "string", column: "type", operator: "=", value: "GENERATION" },
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
          temporalUnit: dashboardDateRangeAggregationSettings[agg].date_trunc,
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
    },
    {
      enabled: !isLoading && selectedModels.length > 0 && allModels.length > 0,
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
        { type: "string", column: "type", operator: "=", value: "GENERATION" },
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
          temporalUnit: dashboardDateRangeAggregationSettings[agg].date_trunc,
        },
        {
          type: "string",
          column: "model",
        },
      ],
      orderBy: [{ column: "totalTokens", direction: "DESC", agg: "SUM" }],
      queryName: "observations-usage-by-type-timeseries",
    },
    {
      enabled: !isLoading && selectedModels.length > 0 && allModels.length > 0,
      trpc: {
        context: {
          skipBatch: true,
        },
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

  // had to add this function as tremor under the hodd adds more variables
  // to the function call which would break usdFormatter.
  const oneValueUsdFormatter = (value: number) => {
    return totalCostDashboardFormatted(value);
  };

  const data = [
    {
      tabTitle: "Cost by model",
      data: costByModel,
      totalMetric: totalCostDashboardFormatted(totalCost),
      metricDescription: `Cost`,
      formatter: oneValueUsdFormatter,
    },
    {
      tabTitle: "Cost by type",
      data: costByType,
      totalMetric: totalCostDashboardFormatted(totalCost),
      metricDescription: `Cost`,
      formatter: oneValueUsdFormatter,
    },
    {
      tabTitle: "Units by model",
      data: unitsByModel,
      totalMetric: totalTokens
        ? compactNumberFormatter(totalTokens)
        : compactNumberFormatter(0),
      metricDescription: `Units`,
    },
    {
      tabTitle: "Units by type",
      data: unitsByType,
      totalMetric: totalTokens
        ? compactNumberFormatter(totalTokens)
        : compactNumberFormatter(0),
      metricDescription: `Units`,
    },
  ];

  return (
    <DashboardCard
      className={className}
      title="Model Usage"
      isLoading={
        isLoading || (queryResult.isLoading && selectedModels.length > 0)
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
                queryResult.isLoading ? (
                  <NoDataOrLoading
                    isLoading={isLoading || queryResult.isLoading}
                  />
                ) : (
                  <BaseTimeSeriesChart
                    agg={agg}
                    data={item.data}
                    showLegend={true}
                    connectNulls={true}
                    valueFormatter={item.formatter}
                  />
                )}
              </>
            ),
          };
        })}
      />
    </DashboardCard>
  );
};
