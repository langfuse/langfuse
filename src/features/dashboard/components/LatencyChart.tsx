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
} from "@/src/features/dashboard/components/hooks";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";

export const LatencyChart = ({
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
  const data = api.dashboard.chart.useQuery({
    projectId,
    from: "observations",
    select: [{ column: "duration", agg: "AVG" }, { column: "model" }],
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
  });

  const allModels = getAllModels(projectId, globalFilterState);

  const transformedData =
    data.data && allModels
      ? fillMissingValuesAndTransform(
          extractTimeSeriesData(data.data, "startTime", [
            { labelColumn: "model", valueColumn: "avgDuration" },
          ]),
          allModels,
        )
      : [];

  return (
    <DashboardCard
      className={className}
      title="Model latencies"
      description="Average latency (ms) per LLM generation"
      isLoading={data.isLoading}
    >
      <BaseTimeSeriesChart
        agg={agg}
        data={transformedData ?? []}
        connectNulls={true}
      />
    </DashboardCard>
  );
};
