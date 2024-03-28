import { api } from "@/src/utils/api";
import {
  dateTimeAggregationSettings,
  type DateTimeAggregationOption,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { type FilterState } from "@langfuse/shared";
import {
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
  isEmptyTimeSeries,
} from "@/src/features/dashboard/components/hooks";
import { NoData } from "@/src/features/dashboard/components/NoData";
import DocPopup from "@/src/components/layouts/doc-popup";
import { createTracesTimeFilter } from "@/src/features/dashboard/lib/dashboard-utils";

export function ChartScores(props: {
  className?: string;
  agg: DateTimeAggregationOption;
  globalFilterState: FilterState;
  projectId: string;
}) {
  const scores = api.dashboard.chart.useQuery(
    {
      projectId: props.projectId,
      from: "traces_scores",
      select: [{ column: "scoreName" }, { column: "value", agg: "AVG" }],
      filter: createTracesTimeFilter(props.globalFilterState),
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
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

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
      description="Average score per name"
      isLoading={scores.isLoading}
    >
      {!isEmptyTimeSeries(extractedScores) ? (
        <BaseTimeSeriesChart
          agg={props.agg}
          data={extractedScores}
          connectNulls
        />
      ) : (
        <NoData noDataText="No data">
          <DocPopup
            description="Scores evaluate LLM quality and can be created manually or using the SDK."
            href="https://langfuse.com/docs/scores"
          />
        </NoData>
      )}
    </DashboardCard>
  );
}
