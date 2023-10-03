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
  transformMap,
} from "@/src/features/dashboard/components/hooks";

export const LatencyChart = ({
  projectId,
  globalFilterState,
  agg,
}: {
  projectId: string;
  globalFilterState: FilterState;
  agg: DateTimeAggregationOption;
}) => {
  const data = api.dashboard.chart.useQuery({
    projectId,
    from: "observations",
    select: [
      { column: "duration", agg: "AVG" },
      { column: "model", agg: null },
    ],
    filter:
      [
        ...globalFilterState,
        { type: "string", column: "type", operator: "=", value: "GENERATION" },
      ] ?? [],
    groupBy: [
      {
        type: "datetime",
        column: "startTime",
        temporalUnit: dateTimeAggregationSettings[agg].date_trunc,
      },
      { type: "string", column: "model" },
    ],
    orderBy: [],
  });

  const allModels = getAllModels(projectId, globalFilterState);

  const transformedData =
    data.data && allModels
      ? transformMap(reduceData(data.data, "avgDuration"), allModels)
      : [];

  return (
    <Card>
      <CardHeader className="relative">
        <CardTitle>Model latencies</CardTitle>
        <CardDescription>
          Average latency (ms) per LLM generation
        </CardDescription>
        {data.isLoading ? (
          <div className="absolute right-5 top-5 ">
            <Loader className="h-5 w-5 animate-spin" />
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <BaseTimeSeriesChart
          agg={agg}
          data={transformedData ?? []}
          connectNulls={true}
        />
      </CardContent>
    </Card>
  );
};
