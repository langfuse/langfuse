import {
  type ScoreSourceType,
  type FilterState,
  type ScoreDataTypeType,
} from "@langfuse/shared";
import {
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
} from "@/src/features/dashboard/components/hooks";
import { createTracesTimeFilter } from "@/src/features/dashboard/lib/dashboard-utils";
import {
  type DashboardDateRangeAggregationOption,
  dashboardDateRangeAggregationSettings,
} from "@/src/utils/date-range-utils";
import React, { useMemo } from "react";
import { DataCard } from "@/src/components/design-system/DataCard/DataCard";
import { type QueryType, type ViewVersion } from "@langfuse/shared/query";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";
import { useLineChartTimeSeries } from "@/src/features/widgets/chart-library/useLineChartTimeSeries";
import { useLargeDatasetGuard } from "@/src/features/widgets/chart-library/useLargeDatasetGuard";
import { isChartDataEmpty } from "@/src/features/widgets/chart-library/isChartDataEmpty";
import { timeSeriesToDataPoints } from "@/src/features/dashboard/lib/chart-data-adapters";
import { useScheduledDashboardExecuteQuery } from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";

export function NumericScoreTimeSeriesCard(props: {
  projectId: string;
  source: ScoreSourceType;
  dataType: Extract<ScoreDataTypeType, "NUMERIC" | "BOOLEAN">;
  name: string;
  agg: DashboardDateRangeAggregationOption;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  metricsVersion: ViewVersion;
  schedulerId?: string;
  /** Shared hover-sync group so this chart joins the dashboard crosshair. */
  syncId?: string;
  sync?: {
    activeKey: string | undefined;
    onActiveKeyChange: (key: string | undefined) => void;
  };
}) {
  const scoresQuery: QueryType = {
    view: "scores-numeric",
    dimensions: [{ field: "name" }],
    metrics: [{ measure: "value", aggregation: "avg" }],
    filters: [
      ...mapLegacyUiTableFilterToView(
        "scores-numeric",
        createTracesTimeFilter(props.globalFilterState, "scoreTimestamp"),
      ),
      {
        column: "name",
        operator: "=",
        value: props.name,
        type: "string",
      },
      {
        column: "source",
        operator: "=",
        value: props.source as string,
        type: "string",
      },
      {
        column: "dataType",
        operator: "=",
        value: props.dataType as string,
        type: "string",
      },
    ],
    timeDimension: {
      granularity:
        dashboardDateRangeAggregationSettings[props.agg].dateTrunc ?? "day",
    },
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
      queryId: `${props.schedulerId ?? "home:score-analytics"}:numeric:${props.source}:${props.name}`,
    },
  );

  const extractedScores = useMemo(() => {
    return scores.data
      ? fillMissingValuesAndTransform(
          extractTimeSeriesData(
            scores.data as DatabaseRow[],
            "time_dimension",
            [
              {
                uniqueIdentifierColumns: [{ accessor: "name" }],
                valueColumn: "avg_value",
              },
            ],
          ),
        )
      : [];
  }, [scores.data]);

  const points = useMemo(
    () => timeSeriesToDataPoints(extractedScores),
    [extractedScores],
  );
  const { shouldWarn, proceed } = useLargeDatasetGuard(points.length, false);
  const prepared = useLineChartTimeSeries({
    data: !scores.isPending && !scores.isError && !shouldWarn ? points : [],
    syncId: props.syncId,
    sync: props.sync,
    missingValue: "gap",
    showDataPointDots: false,
  });
  const card = {
    title:
      props.dataType === "NUMERIC"
        ? "Moving average over time"
        : "Scores over time",
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
  if (isChartDataEmpty(points))
    return <DataCard {...card} content={{ type: "empty" }} />;
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
