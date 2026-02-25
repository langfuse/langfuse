import { api } from "@/src/utils/api";
import {
  type ScoreSourceType,
  type FilterState,
  type ScoreDataTypeType,
} from "@langfuse/shared";
import { type ViewVersion } from "@/src/features/query";
import { createTracesTimeFilter } from "@/src/features/dashboard/lib/dashboard-utils";
import React from "react";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { scoreHistogramToDataPoints } from "@/src/features/dashboard/lib/chart-data-adapters";
import { ChartLoadingState } from "@/src/features/widgets/chart-library/ChartLoadingState";
import { getChartLoadingStateProps } from "@/src/features/widgets/chart-library/chartLoadingStateUtils";

export function NumericScoreHistogram(props: {
  projectId: string;
  name: string;
  source: ScoreSourceType;
  dataType: Extract<ScoreDataTypeType, "NUMERIC" | "BOOLEAN">;
  globalFilterState: FilterState;
  metricsVersion?: ViewVersion;
}) {
  const version = props.metricsVersion ?? "v1";
  const histogram = api.dashboard.scoreHistogram.useQuery(
    {
      projectId: props.projectId,
      version,
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
      // v1 fetches raw values client-side (capped at 10k rows).
      // v2 aggregates server-side via histogram() — limit is unused.
      ...(version === "v1" ? { limit: 10000 } : {}),
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      meta: {
        silentHttpCodes: [422],
      },
    },
  );

  const { chartData, chartLabels } = histogram.data
    ? histogram.data
    : { chartData: [], chartLabels: [] };

  const chartLoadingState = getChartLoadingStateProps({
    isPending: histogram.isPending,
    isError: histogram.isError,
  });

  return Boolean(chartData.length) ? (
    <div className="relative h-80 w-full shrink-0">
      <Chart
        chartType="HISTOGRAM"
        data={scoreHistogramToDataPoints(chartData, chartLabels)}
        rowLimit={100}
        chartConfig={{ type: "HISTOGRAM", subtle_fill: true }}
      />
      <ChartLoadingState
        isLoading={chartLoadingState.isLoading}
        showSpinner={chartLoadingState.showSpinner}
        showHintImmediately={chartLoadingState.showHintImmediately}
        hintText={chartLoadingState.hintText}
        className="absolute inset-0 z-20 bg-background/80 backdrop-blur-sm"
        hintClassName="max-w-sm px-4"
      />
    </div>
  ) : chartLoadingState.isLoading ? (
    <div className="relative min-h-[9rem] w-full">
      <ChartLoadingState
        isLoading={chartLoadingState.isLoading}
        showSpinner={chartLoadingState.showSpinner}
        showHintImmediately={chartLoadingState.showHintImmediately}
        hintText={chartLoadingState.hintText}
        className="absolute inset-0 z-20 bg-background/80 backdrop-blur-sm"
        hintClassName="max-w-sm px-4"
      />
    </div>
  ) : (
    <NoDataOrLoading isLoading={false} />
  );
}
