import { api } from "@/src/utils/api";

import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { type ScoreDataType, type FilterState } from "@langfuse/shared";
import {
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
  isEmptyTimeSeries,
} from "@/src/features/dashboard/components/hooks";
import {
  type DashboardDateRangeAggregationOption,
  dashboardDateRangeAggregationSettings,
} from "@/src/utils/date-range-utils";
import { getScoreDataTypeIcon } from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import {
  type QueryType,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";

export function ChartScores(props: {
  className?: string;
  agg: DashboardDateRangeAggregationOption;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  projectId: string;
  isLoading?: boolean;
}) {
  const scoresQuery: QueryType = {
    view: "scores-numeric",
    dimensions: [{ field: "name" }, { field: "dataType" }, { field: "source" }],
    metrics: [{ measure: "value", aggregation: "avg" }],
    filters: mapLegacyUiTableFilterToView(
      "scores-numeric",
      props.globalFilterState,
    ),
    timeDimension: {
      granularity: dashboardDateRangeAggregationSettings[props.agg].date_trunc,
    },
    fromTimestamp: props.fromTimestamp.toISOString(),
    toTimestamp: props.toTimestamp.toISOString(),
    orderBy: null,
  };

  const scores = api.dashboard.executeQuery.useQuery(
    {
      projectId: props.projectId,
      query: scoresQuery,
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
        extractTimeSeriesData(scores.data as DatabaseRow[], "time_dimension", [
          {
            uniqueIdentifierColumns: [
              {
                accessor: "data_type",
                formatFct: (value) =>
                  getScoreDataTypeIcon(value as ScoreDataType),
              },
              { accessor: "name" },
              {
                accessor: "source",
                formatFct: (value) => `(${value.toLowerCase()})`,
              },
            ],
            valueColumn: "avg_value",
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
