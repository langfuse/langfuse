import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/src/components/ui/card";
import { api } from "@/src/utils/api";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import {
  dateTimeAggregationSettings,
  type DateTimeAggregationOption,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import { type FilterState } from "@/src/features/filters/types";
import { Loader } from "lucide-react";
import {
  getAllModels,
  reduceData,
  transformMapAndFillZeroValues,
} from "@/src/features/dashboard/components/hooks";

export const TokenChart = ({
  projectId,
  globalFilterState,
  agg,
}: {
  projectId: string;
  globalFilterState: FilterState;
  agg: DateTimeAggregationOption;
}) => {
  const totalTokens = api.dashboard.chart.useQuery({
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
  });

  const allModels = getAllModels(projectId, globalFilterState);

  const transformedTotalTokens =
    totalTokens.data && allModels
      ? transformMapAndFillZeroValues(
          reduceData(totalTokens.data, "sumTotalTokens"),
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

  console.log(transformedTotalTokens);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader className="relative">
          <CardTitle>Number of tokens</CardTitle>
          <CardDescription>Count</CardDescription>
          {totalTokens.isLoading ? (
            <div className="absolute right-5 top-5 ">
              <Loader className="h-5 w-5 animate-spin" />
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          <BaseTimeSeriesChart
            agg={agg}
            data={transformedTotalTokens ?? []}
            connectNulls={true}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="relative">
          <CardTitle>Model cost</CardTitle>
          <CardDescription>USD</CardDescription>
          {totalTokens.isLoading ? (
            <div className="absolute right-5 top-5 ">
              <Loader className="h-5 w-5 animate-spin" />
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          <BaseTimeSeriesChart
            agg={agg}
            data={transformedModelCost ?? []}
            connectNulls={true}
          />
        </CardContent>
      </Card>
    </div>
  );
};
