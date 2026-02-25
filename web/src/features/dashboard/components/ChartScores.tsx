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
  type ViewVersion,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { timeSeriesToDataPoints } from "@/src/features/dashboard/lib/chart-data-adapters";
import { ChartLoadingState } from "@/src/features/widgets/chart-library/ChartLoadingState";
import { getChartLoadingStateProps } from "@/src/features/widgets/chart-library/chartLoadingStateUtils";

export function ChartScores(props: {
  className?: string;
  agg: DashboardDateRangeAggregationOption;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  projectId: string;
  isLoading?: boolean;
  metricsVersion?: ViewVersion;
  schedulerId?: string;
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

  const scores = useScheduledDashboardExecuteQuery(
    {
      projectId: props.projectId,
      query: scoresQuery,
      version: props.metricsVersion,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      meta: {
        silentHttpCodes: [422],
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

  const chartLoadingState = getChartLoadingStateProps({
    isPending: props.isLoading || scores.isPending,
    isError: scores.isError,
  });

  return (
    <DashboardCard
      className={props.className}
      title="Scores"
      description="Moving average per score"
      isLoading={false}
    >
      {!isEmptyTimeSeries({ data: extractedScores }) ? (
        <div className="relative min-h-80">
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
          <ChartLoadingState
            isLoading={chartLoadingState.isLoading}
            showSpinner={chartLoadingState.showSpinner}
            showHintImmediately={chartLoadingState.showHintImmediately}
            hintText={chartLoadingState.hintText}
            className="absolute inset-0 z-20 bg-background/80 backdrop-blur-sm"
            hintClassName="max-w-sm px-4"
          />
        </div>
      ) : chartLoadingState.isLoading ? (
        <div className="relative min-h-80 w-full">
          <ChartLoadingState
            isLoading={chartLoadingState.isLoading}
            showSpinner={chartLoadingState.showSpinner}
            showHintImmediately={chartLoadingState.showHintImmediately}
            hintText={chartLoadingState.hintText}
            className="absolute inset-0 z-20 bg-background/80 backdrop-blur-sm"
            hintClassName="max-w-sm px-4"
          />
        </div>
      ) : (
        <NoDataOrLoading
          isLoading={false}
          description="Scores evaluate LLM quality and can be created manually or using the SDK."
          href="https://langfuse.com/docs/evaluation/overview"
          className="h-full"
        />
      )}
    </DashboardCard>
  );
}
