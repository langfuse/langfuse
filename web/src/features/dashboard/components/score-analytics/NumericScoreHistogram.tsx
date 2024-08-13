import { api } from "@/src/utils/api";

import {
  type ScoreSource,
  type FilterState,
  type ScoreDataType,
} from "@langfuse/shared";
import { createTracesTimeFilter } from "@/src/features/dashboard/lib/dashboard-utils";
import React from "react";
import { BarChart } from "@tremor/react";
import { getColorsForCategories } from "@/src/features/dashboard/utils/getColorsForCategories";
import {
  createHistogramData,
  padChartData,
} from "@/src/features/dashboard/lib/score-analytics-utils";

export function NumericScoreHistogram(props: {
  projectId: string;
  name: string;
  source: ScoreSource;
  dataType: ScoreDataType;
  globalFilterState: FilterState;
}) {
  const scores = api.dashboard.chart.useQuery(
    {
      projectId: props.projectId,
      from: "traces_scores",
      select: [{ column: "value" }],
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
    ? createHistogramData(scores.data)
    : { chartData: [], chartLabels: [] };

  const colors = getColorsForCategories(chartLabels);
  const paddedChartData = padChartData(chartData);

  return (
    <BarChart
      className="mt-6"
      data={paddedChartData}
      index="binLabel"
      categories={chartLabels}
      colors={colors}
      valueFormatter={(number: number) =>
        Intl.NumberFormat("en-US").format(number).toString()
      }
      yAxisWidth={48}
      barCategoryGap={"0%"}
    />
  );
}
