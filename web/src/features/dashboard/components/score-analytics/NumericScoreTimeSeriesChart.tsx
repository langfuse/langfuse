import {
  type ScoreSourceType,
  type FilterState,
  type ScoreDataTypeType,
} from "@langfuse/shared";
import {
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
  isEmptyTimeSeries,
} from "../hooks";
import { createTracesTimeFilter } from "../../lib/dashboard-utils";
import {
  type DashboardDateRangeAggregationOption,
  dashboardDateRangeAggregationSettings,
} from "@/src/utils/date-range-utils";
import React, { useMemo } from "react";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { type QueryType, type ViewVersion } from "@langfuse/shared/query";
import { mapLegacyUiTableFilterToView } from "../../lib/dashboardUiTableToViewMapping";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";
import { DashboardLineTimeSeriesChart } from "../DashboardLineTimeSeriesChart";
import { useScheduledDashboardExecuteQuery } from "../../hooks/useDashboardQueryScheduler";

export function NumericScoreTimeSeriesChart(props: {
  projectId: string;
  source: ScoreSourceType;
  dataType: Extract<ScoreDataTypeType, "NUMERIC" | "BOOLEAN">;
  name: string;
  agg: DashboardDateRangeAggregationOption;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  metricsVersion: ViewVersion;
  schedulerId?: string;
  /** Shared hover-sync group so this chart joins the dashboard crosshair. */
  syncId?: string;
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
      queryId: `${props.schedulerId ?? "home:score-analytics"}:numeric:${props.source}:${props.name}`,
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

  return !isEmptyTimeSeries({
    data: extractedScores,
    isNullValueAllowed: true,
  }) ? (
    <div className="h-80 w-full shrink-0">
      <DashboardLineTimeSeriesChart
        data={extractedScores}
        subtleFill
        syncId={props.syncId}
      />
    </div>
  ) : (
    <NoDataOrLoading isLoading={scores.isLoading} />
  );
}
