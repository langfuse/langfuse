import { api } from "@/src/utils/api";

import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { type ScoreDataTypeType, type FilterState } from "@langfuse/shared";
import {
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
  isEmptyTimeSeries,
} from "@/src/features/dashboard/components/hooks";
import {
  type DashboardDateRangeAggregationOption,
  dashboardDateRangeAggregationSettings,
} from "@/src/utils/date-range-utils";
import { getScoreDataTypeIcon } from "@/src/features/scores/lib/scoreColumns";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import {
  type QueryType,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { timeSeriesToDataPoints } from "@/src/features/dashboard/lib/tremorv4-recharts-chart-adapters";

export function ChartScores(props: {
  className?: string;
  agg: DashboardDateRangeAggregationOption;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  projectId: string;
  isLoading?: boolean;
  isDashboardChartsBeta?: boolean;
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
      granularity:
        dashboardDateRangeAggregationSettings[props.agg].dateTrunc ?? "day",
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
                  getScoreDataTypeIcon(value as ScoreDataTypeType),
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
      isLoading={props.isLoading || scores.isPending}
    >
      {!isEmptyTimeSeries({ data: extractedScores }) ? (
        props.isDashboardChartsBeta ? (
          <div className="min-h-80">
            <Chart
              chartType="LINE_TIME_SERIES"
              data={timeSeriesToDataPoints(extractedScores, props.agg)}
              rowLimit={100}
              chartConfig={{
                type: "LINE_TIME_SERIES",
                show_data_point_dots: false,
                subtle_fill: true,
              }}
              legendPosition="above"
            />
          </div>
        ) : (
          <BaseTimeSeriesChart
            className="[&_text]:fill-muted-foreground [&_tspan]:fill-muted-foreground"
            agg={props.agg}
            data={extractedScores}
            connectNulls
          />
        )
      ) : (
        <NoDataOrLoading
          isLoading={props.isLoading || scores.isPending}
          description="Scores evaluate LLM quality and can be created manually or using the SDK."
          href="https://langfuse.com/docs/evaluation/overview"
          className="h-full"
        />
      )}
    </DashboardCard>
  );
}
