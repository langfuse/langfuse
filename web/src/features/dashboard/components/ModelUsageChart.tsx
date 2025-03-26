import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { env } from "@/src/env.mjs";
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

export const ModelUsageChart = ({
  className,
  projectId,
  globalFilterState,
  agg,
  isLoading = false,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  agg: DashboardDateRangeAggregationOption;
  isLoading?: boolean;
}) => {
  const {
    allModels,
    selectedModels,
    setSelectedModels,
    isAllSelected,
    buttonText,
    handleSelectAll,
  } = useModelSelection(projectId, globalFilterState);

  const queryResult = api.dashboard.chart.useQuery(
    {
      projectId,
      from: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION // Langfuse Cloud has already completed the cost backfill job, thus cost can be pulled directly from obs. table
        ? "traces_observations"
        : "traces_observationsview",
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
      queryName: "observations-total-cost-by-model-timeseries",
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
      from: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION // Langfuse Cloud has already completed the cost backfill job, thus cost can be pulled directly from obs. table
        ? "traces_observations"
        : "traces_observationsview",
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
      from: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION // Langfuse Cloud has already completed the cost backfill job, thus cost can be pulled directly from obs. table
        ? "traces_observations"
        : "traces_observationsview",
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
          extractTimeSeriesData(queryResult.data, "startTime", [
            {
              uniqueIdentifierColumns: [{ accessor: "model" }],
              valueColumn: "units",
            },
          ]),
          selectedModels,
        )
      : [];

  const costByModel =
    queryResult.data && allModels.length > 0
      ? fillMissingValuesAndTransform(
          extractTimeSeriesData(queryResult.data, "startTime", [
            {
              uniqueIdentifierColumns: [{ accessor: "model" }],
              valueColumn: "cost",
            },
          ]),
          selectedModels,
        )
      : [];

  const totalCost = queryResult.data?.reduce(
    (acc, curr) =>
      acc + (!isNaN(curr.cost as number) ? (curr.cost as number) : 0),
    0,
  );

  const totalTokens = queryResult.data?.reduce(
    (acc, curr) =>
      acc + (!isNaN(curr.units as number) ? (curr.units as number) : 0),
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
