import { api } from "@/src/utils/api";

import {
  type ScoreSourceType,
  type FilterState,
  type ScoreDataType,
} from "@langfuse/shared";
import { createTracesTimeFilter } from "@/src/features/dashboard/lib/dashboard-utils";
import React from "react";
import { BarChart } from "@tremor/react";
import { Card } from "@/src/components/ui/card";
import { getColorsForCategories } from "@/src/features/dashboard/utils/getColorsForCategories";
import { padChartData } from "@/src/features/dashboard/lib/score-analytics-utils";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";

export function NumericScoreHistogram(props: {
  projectId: string;
  name: string;
  source: ScoreSourceType;
  dataType: ScoreDataType;
  globalFilterState: FilterState;
}) {
  const histogram = api.dashboard.scoreHistogram.useQuery(
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
          column: "scoreSource",
          value: props.source,
          operator: "=",
        },
        {
          type: "string",
          column: "scoreDataType",
          value: props.dataType,
          operator: "=",
        },
      ],
      limit: 10000,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const { chartData, chartLabels } = histogram.data
    ? histogram.data
    : { chartData: [], chartLabels: [] };

  const colors = getColorsForCategories(chartLabels);
  const paddedChartData = padChartData(chartData);

  return histogram.isLoading || !Boolean(chartData.length) ? (
    <NoDataOrLoading isLoading={histogram.isLoading} />
  ) : (
    <Card className="min-h-[9rem] w-full flex-1 rounded-tremor-default border">
      <BarChart
        className="mt-4"
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
    </Card>
  );
}
