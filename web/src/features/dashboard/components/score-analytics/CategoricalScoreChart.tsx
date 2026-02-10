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
import {
  type QueryType,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { scoreChartDataToDataPoints } from "@/src/features/dashboard/lib/tremorv4-recharts-chart-adapters";
import { isEmptyChart } from "@/src/features/dashboard/lib/score-analytics-utils";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";

export function CategoricalScoreChart(props: {
  projectId: string;
  scoreData: ScoreData;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  agg?: DashboardDateRangeAggregationOption;
  isDashboardChartsBeta?: boolean;
}) {
  const scoresQuery: QueryType = {
    view: "scores-categorical",
    dimensions: [{ field: "name" }, { field: "stringValue" }],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: [
      ...mapLegacyUiTableFilterToView(
        "scores-categorical",
        createTracesTimeFilter(props.globalFilterState, "scoreTimestamp"),
      ),
      {
        column: "name",
        operator: "=",
        value: props.scoreData.name,
        type: "string",
      },
      {
        column: "source",
        operator: "=",
        value: props.scoreData.source,
        type: "string",
      },
      {
        column: "dataType",
        operator: "=",
        value: props.scoreData.dataType,
        type: "string",
      },
    ],
    timeDimension: props.agg
      ? {
          granularity:
            dashboardDateRangeAggregationSettings[props.agg].dateTrunc ?? "day",
        }
      : null,
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

  const { chartData, chartLabels } = useMemo(() => {
    if (!scores.data) return { chartData: [], chartLabels: [] };

    const adapter = new DashboardCategoricalScoreAdapter(
      scores.data.map((row) => ({
        ...row,
        scoreValue: row.stringValue,
        count: row.count_count,
      })) as DatabaseRow[],
      "time_dimension",
      props.agg,
    );
    return adapter.toChartData();
  }, [scores.data, props.agg]);

  if (props.isDashboardChartsBeta) {
    if (isEmptyChart({ data: chartData })) {
      return (
        <NoDataOrLoading
          isLoading={scores.isLoading}
          className="min-h-[9rem] flex-1"
        />
      );
    }
    return (
      <div className="h-80 w-full shrink-0">
        <Chart
          chartType="VERTICAL_BAR"
          data={scoreChartDataToDataPoints(chartData, chartLabels)}
          rowLimit={100}
          chartConfig={{
            type: "VERTICAL_BAR",
            row_limit: 100,
            subtle_fill: true,
          }}
        />
      </div>
    );
  }

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
