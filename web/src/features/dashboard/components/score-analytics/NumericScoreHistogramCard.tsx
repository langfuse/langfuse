import { api } from "@/src/utils/api";
import {
  type ScoreSourceType,
  type FilterState,
  type ScoreDataTypeType,
} from "@langfuse/shared";
import { type ViewVersion } from "@langfuse/shared/query";
import { createTracesTimeFilter } from "@/src/features/dashboard/lib/dashboard-utils";
import React from "react";
import { useHistogramChart } from "@/src/features/widgets/chart-library/useHistogramChart";
import { DataCard } from "@/src/components/design-system/DataCard/DataCard";
import { useLargeDatasetGuard } from "@/src/features/widgets/chart-library/useLargeDatasetGuard";
import { scoreHistogramToDataPoints } from "@/src/features/dashboard/lib/chart-data-adapters";

export function NumericScoreHistogramCard(props: {
  projectId: string;
  name: string;
  source: ScoreSourceType;
  dataType: Extract<ScoreDataTypeType, "NUMERIC" | "BOOLEAN">;
  globalFilterState: FilterState;
  metricsVersion: ViewVersion;
}) {
  const version = props.metricsVersion;
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
    },
  );

  const { chartData, chartLabels } = histogram.data
    ? histogram.data
    : { chartData: [], chartLabels: [] };
  const { shouldWarn, proceed } = useLargeDatasetGuard(chartData.length, false);
  const prepared = useHistogramChart({
    data:
      !histogram.isLoading && !histogram.isError && !shouldWarn
        ? scoreHistogramToDataPoints(chartData, chartLabels)
        : [],
  });
  const card = {
    title: "Total aggregate scores",
    description:
      version === "v1" ? "Aggregate of up to 10,000 scores" : undefined,
  };

  if (histogram.isLoading)
    return (
      <DataCard
        {...card}
        content={{ type: "loading", progress: { type: "spinner" } }}
      />
    );
  if (histogram.isError)
    return (
      <DataCard
        {...card}
        content={{ type: "error", message: histogram.error.message }}
      />
    );
  if (!chartData.length)
    return <DataCard {...card} content={{ type: "empty" }} />;

  if (shouldWarn) {
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
  }

  if (!prepared.visualization.data.length)
    return <DataCard {...card} content={{ type: "empty" }} />;
  return <DataCard {...card} {...prepared} content={prepared.visualization} />;
}
