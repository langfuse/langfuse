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

type ModelUsageReturnType = {
  startTime: string;
  units: Record<string, number>;
  cost: Record<string, number>;
  model: string;
};

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

  const totalCostTimeSeriesQuery = api.dashboard.chart.useQuery(
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

  const costByTypeTimeSeriesQuery = api.dashboard.chart.useQuery(
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
          type: "datetime",1
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
      queryName: "observations-total-cost-by-type-timeseries",
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

  const totalCostTimeSeries =
    totalCostTimeSeriesQuery.data && selectedModels.length > 0
      ? fillMissingValuesAndTransform(
          extractTimeSeriesData(totalCostTimeSeriesQuery.data, "startTime", [
            {
              uniqueIdentifierColumns: [{ accessor: "model" }],
              valueColumn: "cost",
            },
          ]),
          selectedModels,
        )
      : [];

  const totalCost = totalCostTimeSeriesQuery.data?.reduce(
    (acc, curr) => acc + (curr.cost as number),
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
      data: totalCostTimeSeries,
      totalMetric: totalCostDashboardFormatted(totalCost),
      metricDescription: `Cost`,
      formatter: oneValueUsdFormatter,
    },
    // {
    //   tabTitle: "Cost by type",
    //   data: costByType,
    //   totalMetric: totalCostDashboardFormatted(totalCost),
    //   metricDescription: `Cost`,
    //   formatter: oneValueUsdFormatter,
    // },
    // {
    //   tabTitle: "Units by model",
    //   data: unitsByModel,
    //   totalMetric: totalTokens
    //     ? compactNumberFormatter(totalTokens)
    //     : compactNumberFormatter(0),
    //   metricDescription: `Units`,
    // },
    // {
    //   tabTitle: "Units by type",
    //   data: unitsByType,
    //   totalMetric: totalTokens
    //     ? compactNumberFormatter(totalTokens)
    //     : compactNumberFormatter(0),
    //   metricDescription: `Units`,
    // },
  ];

  return (
    <DashboardCard
      className={className}
      title="Model Usage"
      isLoading={
        isLoading ||
        (totalCostTimeSeriesQuery.isLoading && selectedModels.length > 0)
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

export const createUsageTypeMap = (
  usageTypes: string[],
  uniqueDates: number[],
  uniqueModels: string[],
  typedData: ModelUsageReturnType[],
) => {
  const usageTypeMap = new Map<
    string,
    {
      startTime: string;
      units: number;
      cost: number;
      usageType: string;
      model: string;
    }[]
  >();

  usageTypes.forEach((uu) => {
    const unitEntries: {
      startTime: string;
      units: number;
      cost: number;
      usageType: string;
      model: string;
    }[] = [];

    uniqueDates.forEach((d) => {
      uniqueModels.forEach((m) => {
        const existingEntry = typedData.find(
          (td) =>
            new Date(td.startTime).getTime() === new Date(d).getTime() &&
            td.model === m,
        );

        const entry = {
          startTime: new Date(d).toISOString(),
          model: m,
          units: existingEntry ? existingEntry.units[uu] || 0 : 0,
          cost: existingEntry ? existingEntry.cost[uu] || 0 : 0,
          usageType: uu,
        };

        unitEntries.push(entry);
      });
    });

    usageTypeMap.set(uu, unitEntries);
  });

  return usageTypeMap;
};
