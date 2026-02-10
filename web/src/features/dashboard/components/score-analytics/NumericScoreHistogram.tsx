import { api } from "@/src/utils/api";
import {
  type ScoreSourceType,
  type FilterState,
  type ScoreDataTypeType,
} from "@langfuse/shared";
import { createTracesTimeFilter } from "@/src/features/dashboard/lib/dashboard-utils";
import React from "react";
import { BarChart, type CustomTooltipProps } from "@tremor/react";
import { Card } from "@/src/components/ui/card";
import { getColorsForCategories } from "@/src/features/dashboard/utils/getColorsForCategories";
import { padChartData } from "@/src/features/dashboard/lib/score-analytics-utils";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { Tooltip } from "@/src/features/dashboard/components/Tooltip";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { scoreHistogramToDataPoints } from "@/src/features/dashboard/lib/tremorv4-recharts-chart-adapters";
import { numberFormatter } from "@/src/utils/numbers";

export function NumericScoreHistogram(props: {
  projectId: string;
  name: string;
  source: ScoreSourceType;
  dataType: Extract<ScoreDataTypeType, "NUMERIC" | "BOOLEAN">;
  globalFilterState: FilterState;
  isDashboardChartsBeta?: boolean;
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

  const TooltipComponent = (tooltipProps: CustomTooltipProps) => (
    <Tooltip
      {...tooltipProps}
      formatter={(value) => numberFormatter(Number(value), 0)}
    />
  );

  return histogram.isLoading || !Boolean(chartData.length) ? (
    <NoDataOrLoading isLoading={histogram.isLoading} />
  ) : props.isDashboardChartsBeta ? (
    <div className="h-80 w-full shrink-0">
      <Chart
        chartType="HISTOGRAM"
        data={scoreHistogramToDataPoints(chartData, chartLabels)}
        rowLimit={100}
        chartConfig={{ type: "HISTOGRAM", subtle_fill: true }}
      />
    </div>
  ) : (
    <Card className="min-h-[9rem] w-full flex-1 rounded-md border">
      <BarChart
        className="mt-4 [&_text]:fill-muted-foreground [&_tspan]:fill-muted-foreground"
        data={paddedChartData}
        index="binLabel"
        categories={chartLabels}
        colors={colors}
        valueFormatter={(number: number) => numberFormatter(number, 0)}
        yAxisWidth={48}
        barCategoryGap={"0%"}
        customTooltip={TooltipComponent}
      />
    </Card>
  );
}
