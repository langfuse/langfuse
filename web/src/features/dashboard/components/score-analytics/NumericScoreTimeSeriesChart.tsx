import { api } from "@/src/utils/api";

import {
  type ScoreSourceType,
  type FilterState,
  type ScoreDataTypeType,
} from "@langfuse/shared";
import {
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
  isEmptyTimeSeries,
} from "@/src/features/dashboard/components/hooks";
import { createTracesTimeFilter } from "@/src/features/dashboard/lib/dashboard-utils";
import {
  type DashboardDateRangeAggregationOption,
  dashboardDateRangeAggregationSettings,
} from "@/src/utils/date-range-utils";
import React, { useMemo } from "react";
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

export function NumericScoreTimeSeriesChart(props: {
  projectId: string;
  source: ScoreSourceType;
  dataType: Extract<ScoreDataTypeType, "NUMERIC" | "BOOLEAN">;
  name: string;
  agg: DashboardDateRangeAggregationOption;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  metricsVersion?: ViewVersion;
}) {
  const scoresQuery: QueryType = {
    view: "scores-numeric",
    dimensions: [{ field: "name" }],
    metrics: [{ measure: "value", aggregation: "avg" }],
    filters: [
      ...mapLegacyUiTableFilterToView(
        "scores-numeric",
        createTracesTimeFilter(props.globalFilterState, "scoreTimestamp"),
      ),
      {
        column: "name",
        operator: "=",
        value: props.name,
        type: "string",
      },
      {
        column: "source",
        operator: "=",
        value: props.source as string,
        type: "string",
      },
      {
        column: "dataType",
        operator: "=",
        value: props.dataType as string,
        type: "string",
      },
    ],
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
    },
  );

  const extractedScores = useMemo(() => {
    return scores.data
      ? fillMissingValuesAndTransform(
          extractTimeSeriesData(
            scores.data as DatabaseRow[],
            "time_dimension",
            [
              {
                uniqueIdentifierColumns: [{ accessor: "name" }],
                valueColumn: "avg_value",
              },
            ],
          ),
        )
      : [];
  }, [scores.data]);

  const chartLoadingState = getChartLoadingStateProps({
    isPending: scores.isPending,
    isError: scores.isError,
  });

  return !isEmptyTimeSeries({
    data: extractedScores,
    isNullValueAllowed: true,
  }) ? (
    <div className="relative h-80 w-full shrink-0">
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
    <div className="relative min-h-[9rem] w-full">
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
    <NoDataOrLoading isLoading={false} />
  );
}
