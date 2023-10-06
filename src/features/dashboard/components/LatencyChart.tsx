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
import { TimeSeriesChartCard } from "@/src/features/dashboard/components/TimeSeriesChartCard";

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
    limit: null,
  });

  const allModels = getAllModels(projectId, globalFilterState);

  const transformedData =
    data.data && allModels
      ? transformMapAndFillZeroValues(
          reduceData(data.data, "avgDuration"),
          allModels,
        )
      : [];

  return (
    <TimeSeriesChartCard
      title="Model latencies"
      metric="Average latency (ms) per LLM generation"
      isLoading={data.isLoading}
      data={transformedData}
      agg={agg}
      connectNulls={true}
    />
  );
};
