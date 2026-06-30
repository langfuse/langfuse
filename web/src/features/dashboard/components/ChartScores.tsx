import { useMemo } from "react";
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
import { type QueryType, type ViewVersion } from "@langfuse/shared/query";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { timeSeriesToDataPoints } from "@/src/features/dashboard/lib/chart-data-adapters";
import { useScheduledDashboardExecuteQuery } from "@/src/hooks/useDashboardQueryScheduler";

// Static — hoisted so its reference is stable across re-renders (keeps the
// memoized <Chart> from reconciling on dashboard scheduler re-renders).
const SCORES_CHART_CONFIG = {
  type: "LINE_TIME_SERIES",
  show_data_point_dots: false,
  subtle_fill: true,
} as const;

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
  syncId?: string;
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
      queryId: `${props.schedulerId ?? "home:chart-scores"}:scores`,
      enabled: !props.isLoading,
    },
  );

  // Memoize the transform on the (scheduler-stable) query result so the chart's
  // data prop keeps a stable reference across dashboard re-renders. (LFE-10549)
  const extractedScores = useMemo(
    () =>
      scores.data
        ? fillMissingValuesAndTransform(
            extractTimeSeriesData(
              scores.data as DatabaseRow[],
              "time_dimension",
              [
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
              ],
            ),
          )
        : [],
    [scores.data],
  );

  const chartData = useMemo(
    () => timeSeriesToDataPoints(extractedScores),
    [extractedScores],
  );

  return (
    <DashboardCard
      className={props.className}
      title="Scores"
      description="Moving average per score"
      isLoading={props.isLoading || scores.isPending}
    >
      {!isEmptyTimeSeries({ data: extractedScores }) ? (
        <div className="min-h-80">
          <Chart
            chartType="LINE_TIME_SERIES"
            data={chartData}
            rowLimit={100}
            chartConfig={SCORES_CHART_CONFIG}
            legendPosition="above"
            syncId={props.syncId}
          />
        </div>
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
