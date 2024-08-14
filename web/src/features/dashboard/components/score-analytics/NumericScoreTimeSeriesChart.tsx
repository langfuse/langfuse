import { api } from "@/src/utils/api";

import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
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
import DocPopup from "@/src/components/layouts/doc-popup";
import { createTracesTimeFilter } from "@/src/features/dashboard/lib/dashboard-utils";
import {
  type DashboardDateRangeAggregationOption,
  dashboardDateRangeAggregationSettings,
} from "@/src/utils/date-range-utils";
import React from "react";

export function NumericScoreTimeSeriesChart(props: {
  projectId: string;
  scoreKey: string;
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
          column: "castScoreSource",
          value: props.source as string,
          operator: "=",
        },
        {
          type: "string",
          column: "castScoreDataType",
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

  const extractedScores = scores.data
    ? fillMissingValuesAndTransform(
        extractTimeSeriesData(scores.data, "scoreTimestamp", [
          {
            labelColumn: "scoreName",
            valueColumn: "avgValue",
          },
        ]),
      )
    : [];

  return !isEmptyTimeSeries({
    data: extractedScores,
    isNullValueAllowed: true,
  }) ? (
    <BaseTimeSeriesChart agg={props.agg} data={extractedScores} connectNulls />
  ) : (
    <NoData noDataText="No data">
      <DocPopup
        description="Scores evaluate LLM quality and can be created manually or using the SDK."
        href="https://langfuse.com/docs/scores"
      />
    </NoData>
  );
}
