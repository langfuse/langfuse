import { api } from "@/src/utils/api";

import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { Card } from "@/src/components/ui/card";
import {
  type ScoreSourceType,
  type FilterState,
  type ScoreDataType,
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
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";

export function NumericScoreTimeSeriesChart(props: {
  projectId: string;
  source: ScoreSourceType;
  dataType: ScoreDataType;
  name: string;
  agg: DashboardDateRangeAggregationOption;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
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
    <Card className="min-h-[9rem] w-full flex-1 rounded-tremor-default border">
      <BaseTimeSeriesChart
        agg={props.agg}
        data={extractedScores}
        connectNulls
      />
    </Card>
  ) : (
    <NoDataOrLoading isLoading={scores.isLoading} />
  );
}
