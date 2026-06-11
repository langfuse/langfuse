import { useMemo } from "react";
import { type z } from "zod";

import { api } from "@/src/utils/api";
import { Card, CardContent } from "@/src/components/ui/card";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { ChartLoadingState } from "@/src/features/widgets/chart-library/ChartLoadingState";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { getWidgetMetricPresentation } from "@/src/features/widgets/utils";
import {
  type FilterState,
  type metricAggregations,
  RESOURCE_LIMIT_ERROR_MESSAGE,
} from "@langfuse/shared";
import {
  type MonitorThresholdOperator,
  type MonitorView,
  type MonitorWindow,
  windowToMs,
} from "@langfuse/shared/monitors";

/** previewBucketCount is the number of complete window buckets the preview renders. */
const previewBucketCount = 25;

/** MonitorChartPreview renders the live time-series preview with alert/warning threshold bands for a monitor draft. */
export const MonitorChartPreview = ({
  projectId,
  view,
  filters,
  measure,
  aggregation,
  window,
  thresholdOperator,
  alertThreshold,
  warningThreshold,
}: {
  projectId: string;
  view: MonitorView;
  filters: FilterState;
  measure: string;
  aggregation: z.infer<typeof metricAggregations>;
  window: MonitorWindow;
  thresholdOperator: MonitorThresholdOperator;
  alertThreshold: number | null | undefined;
  warningThreshold: number | null | undefined;
}) => {
  /** fromTimestamp and toTimestamp span 25 complete window buckets ending at the last floored boundary. */
  const { fromTimestamp, toTimestamp } = useMemo(() => {
    const ms = Number(windowToMs(window));
    const to = Math.floor(Date.now() / ms) * ms;
    const from = to - previewBucketCount * ms;
    return {
      toTimestamp: new Date(to).toISOString(),
      fromTimestamp: new Date(from).toISOString(),
    };
  }, [window]);

  /** queryResult runs the preview query for the draft monitor. */
  const queryResult = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      version: "v2",
      query: {
        view,
        dimensions: [],
        metrics: [{ measure, aggregation }],
        filters,
        timeDimension: { granularity: window },
        fromTimestamp,
        toTimestamp,
        orderBy: null,
        chartConfig: { type: "LINE_TIME_SERIES" },
      },
    },
    {
      trpc: { context: { skipBatch: true } },
      meta: { silentHttpCodes: [422] },
      refetchOnWindowFocus: false,
    },
  );

  /** data reshapes the query rows into chart points. */
  const data: DataPoint[] = useMemo(
    () => toChartPoints(queryResult.data ?? [], measure, aggregation),
    [queryResult.data, measure, aggregation],
  );

  /** thresholds lists the warning and alert bands to draw on the chart. */
  const thresholds = useMemo(() => {
    const ordered = [];
    if (warningThreshold != null && Number.isFinite(warningThreshold)) {
      ordered.push({
        value: warningThreshold,
        operator: thresholdOperator,
        color: "yellow" as const,
        label: "Warning",
      });
    }
    if (alertThreshold != null && Number.isFinite(alertThreshold)) {
      ordered.push({
        value: alertThreshold,
        operator: thresholdOperator,
        color: "red" as const,
        label: "Alert",
      });
    }
    return ordered;
  }, [warningThreshold, alertThreshold, thresholdOperator]);

  // Why: without the measure's unit, cost charts render as raw numbers
  // instead of dollar amounts.
  /** metricFormatter formats chart values with the measure's unit. */
  const { metricFormatter } = useMemo(
    () =>
      getWidgetMetricPresentation({
        metric: { measure, agg: aggregation },
        view,
        version: "v2",
      }),
    [measure, aggregation, view],
  );

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col pt-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold tracking-tight">Live Preview</h3>
        </div>
        <div className="relative min-h-0 flex-1">
          <Chart
            chartType="LINE_TIME_SERIES"
            data={data}
            rowLimit={1000}
            thresholds={thresholds}
            metricFormatter={metricFormatter}
          />
          <ChartLoadingState
            isLoading={queryResult.isError}
            showSpinner={false}
            showHintImmediately
            layout="compact"
            hintText={
              queryResult.error?.message ?? RESOURCE_LIMIT_ERROR_MESSAGE
            }
            className="bg-background/80 absolute inset-0 z-20 backdrop-blur-xs"
          />
        </div>
      </CardContent>
    </Card>
  );
};

/** toChartPoints reshapes executeQuery rows into LINE_TIME_SERIES points, coercing string-typed metric values into numbers. */
const toChartPoints = (
  rows: Array<Record<string, unknown>>,
  measure: string,
  aggregation: z.infer<typeof metricAggregations>,
): DataPoint[] => {
  const metricField = `${aggregation}_${measure}`;
  return rows.map((row) => {
    const metric = row[metricField];
    return {
      time_dimension: row["time_dimension"] as string | undefined,
      dimension: "metric",
      metric: Array.isArray(metric) ? metric : Number(metric || 0),
    } satisfies DataPoint;
  });
};
