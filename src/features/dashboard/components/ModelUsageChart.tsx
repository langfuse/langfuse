import { api } from "@/src/utils/api";

import {
  dateTimeAggregationSettings,
  type DateTimeAggregationOption,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import { type FilterState } from "@/src/features/filters/types";

import {
  getAllModels,
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
  isEmptyTimeSeries,
} from "@/src/features/dashboard/components/hooks";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { compactNumberFormatter, usdFormatter } from "@/src/utils/numbers";
import { TabComponent } from "@/src/features/dashboard/components/TabsComponent";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { NoData } from "@/src/features/dashboard/components/NoData";

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
  const tokens = api.dashboard.chart.useQuery({
    projectId,
    from: "observations",
    select: [
      { column: "totalTokens", agg: "SUM" },
      { column: "totalTokenCost" },
      { column: "model" },
    ],
    filter: globalFilterState ?? [],
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
    orderBy: [{ column: "totalTokenCost", direction: "DESC" }],
  });

  const allModels = getAllModels(projectId, globalFilterState);

  const transformedTotalTokens =
    tokens.data && allModels
      ? fillMissingValuesAndTransform(
          extractTimeSeriesData(tokens.data, "startTime", [
            { labelColumn: "model", valueColumn: "sumTotalTokens" },
          ]),
          allModels,
        )
      : [];

  const transformedModelCost =
    tokens.data && allModels
      ? fillMissingValuesAndTransform(
          extractTimeSeriesData(tokens.data, "startTime", [
            { labelColumn: "model", valueColumn: "totalTokenCost" },
          ]),
          allModels,
        )
      : [];

  const totalCost = tokens.data?.reduce(
    (acc, curr) => acc + (curr.totalTokenCost as number),
    0,
  );

  const totalTokens = tokens.data?.reduce(
    (acc, curr) => acc + (curr.sumTotalTokens as number),
    0,
  );

  const data = [
    {
      tabTitle: "Total cost",
      data: transformedModelCost,
      totalMetric: totalCost ? usdFormatter(totalCost) : usdFormatter(0),
      metricDescription: `Token cost`,
      formatter: usdFormatter,
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
      title={"Model Usage"}
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
