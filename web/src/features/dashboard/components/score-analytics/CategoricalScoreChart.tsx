import { api } from "@/src/utils/api";

import {
  type ScoreSource,
  type FilterState,
  type ScoreDataType,
} from "@langfuse/shared";
import { createTracesTimeFilter } from "@/src/features/dashboard/lib/dashboard-utils";
import {
  type DashboardDateRangeAggregationOption,
  dashboardDateRangeAggregationSettings,
} from "@/src/utils/date-range-utils";
import React from "react";
import { BarChart } from "@tremor/react";
import { getColorsForCategories } from "@/src/features/dashboard/utils/getColorsForCategories";
import { transformCategoricalScoresToChartData } from "@/src/features/dashboard/lib/score-analytics-utils";

export function CategoricalScoreChart(props: {
  projectId: string;
  name: string;
  source: ScoreSource;
  dataType: ScoreDataType;
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
          value: props.name,
          operator: "=",
        },
        {
          type: "string",
          column: "castScoreSource",
          value: props.source,
          operator: "=",
        },
        {
          type: "string",
          column: "castScoreDataType",
          value: props.dataType,
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
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const { chartData, chartLabels } = scores.data
    ? transformCategoricalScoresToChartData(
        scores.data,
        "scoreTimestamp",
        props.agg,
      )
    : { chartData: [], chartLabels: [] };

  const barCategoryGap = (chartLength: number): string => {
    if (chartLength > 7) return "10%";
    if (chartLength > 5) return "20%";
    if (chartLength > 3) return "30%";
    else return "40%";
  };
  const colors = getColorsForCategories(chartLabels);

  return (
    <BarChart
      className="mt-4"
      data={chartData}
      index="binLabel"
      categories={chartLabels}
      colors={colors}
      valueFormatter={(number: number) =>
        Intl.NumberFormat("en-US").format(number).toString()
      }
      yAxisWidth={48}
      barCategoryGap={barCategoryGap(chartData.length)}
      stack={!!props.agg}
    />
  );
}
