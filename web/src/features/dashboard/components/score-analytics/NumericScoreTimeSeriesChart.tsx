import { api } from "@/src/utils/api";

import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { Card } from "@/src/components/ui/card";
import {
  type ScoreSource,
  type FilterState,
  type ScoreDataType,
} from "@langfuse/shared";
import {
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
  isEmptyTimeSeries,
} from "@/src/features/dashboard/components/hooks";
import { NoData } from "@/src/features/dashboard/components/NoData";
import { createTracesTimeFilter } from "@/src/features/dashboard/lib/dashboard-utils";
import {
  type DashboardDateRangeAggregationOption,
  dashboardDateRangeAggregationSettings,
} from "@/src/utils/date-range-utils";
import React, { useMemo } from "react";

export function NumericScoreTimeSeriesChart(props: {
  projectId: string;
  source: ScoreSource;
  dataType: ScoreDataType;
  name: string;
  agg: DashboardDateRangeAggregationOption;
  globalFilterState: FilterState;
}) {
  const scores = api.dashboard.chart.useQuery(
    {
      projectId: props.projectId,
      from: "traces_scores",
      select: [{ column: "scoreName" }, { column: "value", agg: "AVG" }],
      filter: [
        ...createTracesTimeFilter(props.globalFilterState, "scoreTimestamp"),
        {
          type: "string",
          column: "scoreName",
          value: props.name,
          operator: "=",
        },
        {
          type: "string",
          column: "scoreSource",
          value: props.source as string,
          operator: "=",
        },
        {
          type: "string",
          column: "scoreDataType",
          value: props.dataType as string,
          operator: "=",
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
        {
          type: "string",
          column: "scoreSource",
        },
        {
          type: "string",
          column: "scoreDataType",
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

  const extractedScores = useMemo(() => {
    return scores.data
      ? fillMissingValuesAndTransform(
          extractTimeSeriesData(scores.data, "scoreTimestamp", [
            {
              uniqueIdentifierColumns: [{ accessor: "scoreName" }],
              valueColumn: "avgValue",
            },
          ]),
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
    <NoData noDataText="No data" className="h-[21rem]"></NoData>
  );
}
