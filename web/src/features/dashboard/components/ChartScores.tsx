import { api } from "@/src/utils/api";

import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { type ScoreDataType, type FilterState } from "@langfuse/shared";
import {
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
  isEmptyTimeSeries,
} from "@/src/features/dashboard/components/hooks";
import { createTracesTimeFilter } from "@/src/features/dashboard/lib/dashboard-utils";
import {
  dashboardDateRangeAggregationSettings,
  type DashboardDateRangeAggregationOption,
} from "@/src/utils/date-range-utils";
import { getScoreDataTypeIcon } from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";

export function ChartScores(props: {
  className?: string;
  agg: DashboardDateRangeAggregationOption;
  globalFilterState: FilterState;
  projectId: string;
  isLoading?: boolean;
}) {
  const scores = api.dashboard.chart.useQuery(
    {
      projectId: props.projectId,
      from: "traces_scores",
      select: [
        { column: "scoreName" },
        { column: "scoreDataType" },
        { column: "scoreSource" },
        { column: "value", agg: "AVG" },
      ],
      filter: [
        ...createTracesTimeFilter(props.globalFilterState, "scoreTimestamp"),
        {
          type: "stringOptions",
          column: "scoreDataType",
          value: ["NUMERIC", "BOOLEAN"],
          operator: "any of",
        },
      ],
      groupBy: [
        {
          type: "datetime",
          column: "scoreTimestamp",
          temporalUnit:
            dashboardDateRangeAggregationSettings[props.agg].date_trunc,
        },
        {
          type: "string",
          column: "scoreName",
        },
        { type: "string", column: "scoreDataType" },
        { type: "string", column: "scoreSource" },
      ],
      queryName: "scores-aggregate-timeseries",
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      enabled: !props.isLoading,
    },
  );

  const extractedScores = scores.data
    ? fillMissingValuesAndTransform(
        extractTimeSeriesData(scores.data, "scoreTimestamp", [
          {
            uniqueIdentifierColumns: [
              {
                accessor: "scoreDataType",
                formatFct: (value) =>
                  getScoreDataTypeIcon(value as ScoreDataType),
              },
              { accessor: "scoreName" },
              {
                accessor: "scoreSource",
                formatFct: (value) => `(${value.toLowerCase()})`,
              },
            ],
            valueColumn: "avgValue",
          },
        ]),
      )
    : [];

  return (
    <DashboardCard
      className={props.className}
      title="Scores"
      description="Moving average per score"
      isLoading={props.isLoading || scores.isLoading}
    >
      {!isEmptyTimeSeries({ data: extractedScores }) ? (
        <BaseTimeSeriesChart
          agg={props.agg}
          data={extractedScores}
          connectNulls
        />
      ) : (
        <NoDataOrLoading
          isLoading={props.isLoading || scores.isLoading}
          description="Scores evaluate LLM quality and can be created manually or using the SDK."
          href="https://langfuse.com/docs/scores"
          className="h-full"
        />
      )}
    </DashboardCard>
  );
}
