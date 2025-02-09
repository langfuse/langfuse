import { api } from "@/src/utils/api";
import { type FilterState } from "@langfuse/shared";
import { createTracesTimeFilter } from "@/src/features/dashboard/lib/dashboard-utils";
import {
  type DashboardDateRangeAggregationOption,
  dashboardDateRangeAggregationSettings,
} from "@/src/utils/date-range-utils";
import React, { useMemo } from "react";
import { DashboardCategoricalScoreAdapter } from "@/src/features/scores/adapters";
import { type ScoreData } from "@/src/features/scores/types";
import { CategoricalChart } from "@/src/features/scores/components/ScoreChart";

export function CategoricalScoreChart(props: {
  projectId: string;
  scoreData: ScoreData;
  globalFilterState: FilterState;
  agg?: DashboardDateRangeAggregationOption;
}) {
  const scores = api.dashboard.chart.useQuery(
    {
      projectId: props.projectId,
      from: "traces_scores",
      select: [
        { column: "scoreName" },
        { column: "scoreDataType" },
        { column: "scoreSource" },
        { column: "stringValue" },
        { column: "stringValue", agg: "COUNT" },
      ],
      filter: [
        ...createTracesTimeFilter(props.globalFilterState, "scoreTimestamp"),
        {
          type: "string",
          column: "scoreName",
          value: props.scoreData.name,
          operator: "=",
        },
        {
          type: "string",
          column: "scoreSource",
          value: props.scoreData.source,
          operator: "=",
        },
        {
          type: "string",
          column: "scoreDataType",
          value: props.scoreData.dataType,
          operator: "=",
        },
      ],
      groupBy: [
        { type: "string", column: "stringValue" },
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
        ...(props.agg
          ? [
              {
                type: "datetime",
                column: "scoreTimestamp",
                temporalUnit:
                  dashboardDateRangeAggregationSettings[props.agg].date_trunc,
              } as const,
            ]
          : []),
      ],
      queryName: "categorical-score-chart",
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const { chartData, chartLabels } = useMemo(() => {
    if (!scores.data) return { chartData: [], chartLabels: [] };

    const adapter = new DashboardCategoricalScoreAdapter(
      scores.data,
      "scoreTimestamp",
      props.agg,
    );
    return adapter.toChartData();
  }, [scores.data, props.agg]);

  return (
    <CategoricalChart
      chartData={chartData}
      chartLabels={chartLabels}
      isLoading={scores.isLoading}
      className="min-h-[9rem] flex-1"
      stack={!!props.agg}
    />
  );
}
