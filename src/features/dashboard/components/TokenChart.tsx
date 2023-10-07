import { api } from "@/src/utils/api";

import {
  dateTimeAggregationSettings,
  type DateTimeAggregationOption,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import { type FilterState } from "@/src/features/filters/types";

import {
  getAllModels,
  reduceData,
  transformMapAndFillZeroValues,
} from "@/src/features/dashboard/components/hooks";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { BaseTabTimeseriesChart } from "@/src/features/dashboard/components/base/BaseTabTimeSeriesChart";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";

export const TokenChart = ({
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
      { column: "model", agg: null },
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
    orderBy: [],
    limit: null,
  });

  const modelCost = api.dashboard.chart.useQuery({
    projectId,
    from: "observations",
    select: [
      { column: "totalTokenCost", agg: null },
      { column: "model", agg: null },
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
    orderBy: [],
    limit: null,
  });

  const allModels = getAllModels(projectId, globalFilterState);

  const transformedTotalTokens =
    tokens.data && allModels
      ? transformMapAndFillZeroValues(
          reduceData(tokens.data, "sumTotalTokens"),
          allModels,
        )
      : [];

  const transformedModelCost =
    modelCost.data && allModels
      ? transformMapAndFillZeroValues(
          reduceData(modelCost.data, "totalTokenCost"),
          allModels,
        )
      : [];

  const totalCost = modelCost.data?.reduce(
    (acc, curr) => acc + (curr.totalTokenCost as number),
    0,
  );

  const totalTokens = tokens.data?.reduce(
    (acc, curr) => acc + (curr.sumTotalTokens as number),
    0,
  );

  const data = [
    {
      tabTitle: "Token cost",
      data: transformedModelCost,
      totalMetric: totalCost ? usdFormatter(totalCost) : "-",
      metricDescription: "Total cost",
      formatter: usdFormatter,
    },
    {
      tabTitle: "Token count",
      data: transformedTotalTokens,
      totalMetric: totalTokens ? numberFormatter(totalTokens) : "-",
      metricDescription: "Total tokens",
    },
  ];

  return (
    <DashboardCard
      className={className}
      title={"Model Usage"}
      isLoading={tokens.isLoading || modelCost.isLoading}
    >
      <BaseTabTimeseriesChart agg={agg} data={data} />
    </DashboardCard>
  );
};
