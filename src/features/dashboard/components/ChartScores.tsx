import { api } from "@/src/utils/api";
import {
  dateTimeAggregationSettings,
  type DateTimeAggregationOption,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { type FilterState } from "@/src/features/filters/types";
import {
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
} from "@/src/features/dashboard/components/hooks";

export function ChartScores(props: {
  className?: string;
  agg: DateTimeAggregationOption;
  globalFilterState: FilterState;
  projectId: string;
}) {
  const scores = api.dashboard.chart.useQuery({
    projectId: props.projectId,
    from: "traces_scores",
    select: [{ column: "scoreName" }, { column: "value", agg: "AVG" }],
    filter:
      props.globalFilterState.map((f) =>
        f.type === "datetime" ? { ...f, column: "timestamp" } : f,
      ) ?? [],
    groupBy: [
      {
        type: "datetime",
        column: "timestamp",
        temporalUnit: dateTimeAggregationSettings[props.agg].date_trunc,
      },
      {
        type: "string",
        column: "scoreName",
      },
    ],
  });

  const extractedScores = scores.data
    ? fillMissingValuesAndTransform(
        extractTimeSeriesData(scores.data, "timestamp", [
          {
            labelColumn: "scoreName",
            valueColumn: "avgValue",
          },
        ]),
      )
    : [];

  return (
    <DashboardCard
      className={props.className}
      title="Scores"
      description="Average"
      isLoading={scores.isLoading}
    >
      <BaseTimeSeriesChart
        agg={props.agg}
        data={extractedScores ?? []}
        connectNulls
      />
    </DashboardCard>
  );
}
