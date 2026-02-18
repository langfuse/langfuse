import { api } from "@/src/utils/api";
import {
  type ScoreSourceType,
  type FilterState,
  type ScoreDataTypeType,
} from "@langfuse/shared";
import { createTracesTimeFilter } from "@/src/features/dashboard/lib/dashboard-utils";
import React from "react";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { scoreHistogramToDataPoints } from "@/src/features/dashboard/lib/chart-data-adapters";

export function NumericScoreHistogram(props: {
  projectId: string;
  name: string;
  source: ScoreSourceType;
  dataType: Extract<ScoreDataTypeType, "NUMERIC" | "BOOLEAN">;
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

  return histogram.isLoading || !Boolean(chartData.length) ? (
    <NoDataOrLoading isLoading={histogram.isLoading} />
  ) : (
    <div className="h-80 w-full shrink-0">
      <Chart
        chartType="HISTOGRAM"
        data={scoreHistogramToDataPoints(chartData, chartLabels)}
        rowLimit={100}
        chartConfig={{ type: "HISTOGRAM", subtle_fill: true }}
      />
    </div>
  );
}
