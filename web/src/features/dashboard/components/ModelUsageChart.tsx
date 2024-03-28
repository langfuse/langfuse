import { api } from "@/src/utils/api";

import {
  dateTimeAggregationSettings,
  type DateTimeAggregationOption,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import { type FilterState } from "@langfuse/shared";

import {
  getAllModels,
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
  isEmptyTimeSeries,
} from "@/src/features/dashboard/components/hooks";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { TabComponent } from "@/src/features/dashboard/components/TabsComponent";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { NoData } from "@/src/features/dashboard/components/NoData";
import { totalCostDashboardFormatted } from "@/src/features/dashboard/lib/dashboard-utils";

export const ModelUsageChart = ({
  className,
  projectId,
  globalFilterState,
  agg,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  agg: DateTimeAggregationOption;
}) => {
  const tokens = api.dashboard.chart.useQuery(
    {
      projectId,
      from: "traces_observationsview",
      select: [
        { column: "totalTokens", agg: "SUM" },
        { column: "calculatedTotalCost", agg: "SUM" },
        { column: "model" },
      ],
      filter: [
        ...globalFilterState,
        { type: "string", column: "type", operator: "=", value: "GENERATION" },
      ],
      groupBy: [
        {
          type: "datetime",
          column: "startTime",
          temporalUnit: dateTimeAggregationSettings[agg].date_trunc,
        },
        {
          type: "string",
          column: "model",
        },
      ],
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

  const allModels = getAllModels(projectId, globalFilterState);

  const transformedTotalTokens =
    tokens.data && allModels.length > 0
      ? fillMissingValuesAndTransform(
          extractTimeSeriesData(tokens.data, "startTime", [
            { labelColumn: "model", valueColumn: "sumTotalTokens" },
          ]),
          allModels,
        )
      : [];

  const transformedModelCost =
    tokens.data && allModels.length > 0
      ? fillMissingValuesAndTransform(
          extractTimeSeriesData(tokens.data, "startTime", [
            {
              labelColumn: "model",
              valueColumn: "sumCalculatedTotalCost",
            },
          ]),
          allModels,
        )
      : [];

  const totalCost = tokens.data?.reduce(
    (acc, curr) => acc + (curr.sumCalculatedTotalCost as number),
    0,
  );

  const totalTokens = tokens.data?.reduce(
    (acc, curr) => acc + (curr.sumTotalTokens as number),
    0,
  );

  // had to add this function as tremor under the hodd adds more variables
  // to the function call which would break usdFormatter.
  const oneValueUsdFormatter = (value: number) => {
    return totalCostDashboardFormatted(value);
  };

  const data = [
    {
      tabTitle: "Total cost",
      data: transformedModelCost,
      totalMetric: totalCostDashboardFormatted(totalCost),
      metricDescription: `Token cost`,
      formatter: oneValueUsdFormatter,
    },
    {
      tabTitle: "Total tokens",
      data: transformedTotalTokens,
      totalMetric: totalTokens
        ? compactNumberFormatter(totalTokens)
        : compactNumberFormatter(0),
      metricDescription: `Token count`,
    },
  ];

  return (
    <DashboardCard
      className={className}
      title="Model Usage"
      isLoading={tokens.isLoading}
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
                />
                {!isEmptyTimeSeries(item.data) ? (
                  <BaseTimeSeriesChart
                    agg={agg}
                    data={item.data}
                    showLegend={true}
                    valueFormatter={item.formatter}
                  />
                ) : (
                  <NoData noDataText="No data available" />
                )}
              </>
            ),
          };
        })}
      />
    </DashboardCard>
  );
};
