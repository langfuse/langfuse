import { type FilterState } from "@langfuse/shared";
import { createTracesTimeFilter } from "@/src/features/dashboard/lib/dashboard-utils";
import {
  type DashboardDateRangeAggregationOption,
  dashboardDateRangeAggregationSettings,
} from "@/src/utils/date-range-utils";
import React, { useMemo } from "react";
import { DashboardCategoricalScoreAdapter } from "@/src/features/scores/adapters/index";
import type { ScoreData } from "@/src/features/scores/types";
import { type QueryType, type ViewVersion } from "@langfuse/shared/query";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";
import { useVerticalBarChart } from "@/src/features/widgets/chart-library/useVerticalBarChart";
import { DataCard } from "@/src/components/design-system/DataCard/DataCard";
import { useLargeDatasetGuard } from "@/src/features/widgets/chart-library/useLargeDatasetGuard";
import { scoreChartDataToDataPoints } from "@/src/features/dashboard/lib/chart-data-adapters";
import { isEmptyChart } from "@/src/features/dashboard/lib/score-analytics-utils";
import { useScheduledDashboardExecuteQuery } from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";

export function CategoricalScoreCard(props: {
  projectId: string;
  scoreData: ScoreData;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  agg?: DashboardDateRangeAggregationOption;
  metricsVersion: ViewVersion;
  schedulerId?: string;
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

  const scores = useScheduledDashboardExecuteQuery(
    {
      projectId: props.projectId,
      query: scoresQuery,
      version: props.metricsVersion,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      queryId: `${props.schedulerId ?? "home:score-analytics"}:categorical:${props.scoreData.source}:${props.scoreData.name}:${props.agg ?? "aggregate"}`,
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

  const points = scoreChartDataToDataPoints(chartData, chartLabels);
  const { shouldWarn, proceed } = useLargeDatasetGuard(points.length, false);
  const prepared = useVerticalBarChart({
    data:
      !scores.isPending && !scores.isError && !shouldWarn
        ? points.slice(0, 100)
        : [],
  });
  const card = {
    title: props.agg ? "Scores over time" : "Total aggregate scores",
  };

  if (scores.isPending)
    return (
      <DataCard
        {...card}
        content={{ type: "loading", progress: { type: "spinner" } }}
      />
    );
  if (scores.isError)
    return (
      <DataCard
        {...card}
        content={{
          type: "error",
          message: scores.error ?? "Failed to load scores",
        }}
      />
    );

  if (isEmptyChart({ data: chartData })) {
    return <DataCard {...card} content={{ type: "empty" }} />;
  }
  if (shouldWarn)
    return (
      <DataCard
        {...card}
        content={{
          type: "confirmation",
          title: "Large Dataset Warning",
          description:
            "This chart has more than 2,000 unique data points. Rendering it may be slow or may crash your browser. Try to reduce the number of dimensions by adding more selective filters or choosing a coarser breakdown dimension.",
          actionLabel: "I understand, proceed to render the chart",
          onConfirm: proceed,
        }}
      />
    );
  return <DataCard {...card} {...prepared} content={prepared.visualization} />;
}
