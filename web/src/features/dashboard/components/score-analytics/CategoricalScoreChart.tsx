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
import React, { useMemo } from "react";
import { BarChart } from "@tremor/react";
import { Card } from "@/src/components/ui/card";
import { getColorsForCategories } from "@/src/features/dashboard/utils/getColorsForCategories";
import {
  isEmptyBarChart,
  transformCategoricalScoresToChartData,
} from "@/src/features/dashboard/lib/score-analytics-utils";
import { NoData } from "@/src/features/dashboard/components/NoData";

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

  const { chartData, chartLabels } = useMemo(() => {
    return scores.data
      ? transformCategoricalScoresToChartData(
          scores.data,
          "scoreTimestamp",
          props.agg,
        )
      : { chartData: [], chartLabels: [] };
  }, [scores.data, props.agg]);

  const barCategoryGap = (chartLength: number): string => {
    if (chartLength > 7) return "10%";
    if (chartLength > 5) return "20%";
    if (chartLength > 3) return "30%";
    else return "40%";
  };
  const colors = getColorsForCategories(chartLabels);

  return isEmptyBarChart({ data: chartData }) ? (
    <NoData noDataText="No data" className="h-[21rem]"></NoData>
  ) : (
    <Card className="min-h-[9rem] w-full flex-1 rounded-tremor-default border">
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
    </Card>
  );
}
