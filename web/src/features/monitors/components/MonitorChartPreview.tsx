import { useMemo, useState } from "react";
import { type z } from "zod";

import { api } from "@/src/utils/api";
import { Card, CardContent } from "@/src/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
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
} from "@langfuse/shared/monitors";
import { TIME_RANGES } from "@/src/utils/date-range-utils";

/** previewRangePresets lists the time ranges offered in the preview picker. */
const previewRangePresets = [
  "last1Hour",
  "last6Hours",
  "last1Day",
  "last7Days",
  "last30Days",
] as const satisfies ReadonlyArray<keyof typeof TIME_RANGES>;

type PreviewRangePreset = (typeof previewRangePresets)[number];

/** MonitorChartPreview renders the live time-series preview with alert/warning threshold bands for a monitor draft. */
export const MonitorChartPreview = ({
  projectId,
  view,
  filters,
  measure,
  aggregation,
  thresholdOperator,
  alertThreshold,
  warningThreshold,
}: {
  projectId: string;
  view: MonitorView;
  filters: FilterState;
  measure: string;
  aggregation: z.infer<typeof metricAggregations>;
  thresholdOperator: MonitorThresholdOperator;
  alertThreshold: number | null | undefined;
  warningThreshold: number | null | undefined;
}) => {
  /** rangePreset is the currently selected preview window key. */
  const [rangePreset, setRangePreset] =
    useState<PreviewRangePreset>("last1Day");

  /** fromTimestamp and toTimestamp bound the preview query to the picked range, anchored to now. */
  const { fromTimestamp, toTimestamp } = useMemo(() => {
    const now = Date.now();
    const minutes = TIME_RANGES[rangePreset].minutes ?? 24 * 60;
    return {
      toTimestamp: new Date(now).toISOString(),
      fromTimestamp: new Date(now - minutes * 60_000).toISOString(),
    };
  }, [rangePreset]);

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
        timeDimension: { granularity: "auto" },
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
  const data: DataPoint[] = useMemo(() => {
    const rows = (queryResult.data ?? []) as Array<Record<string, unknown>>;
    const metricField = `${aggregation}_${measure}`;
    return rows.map((row) => {
      const value = row[metricField];
      return {
        time_dimension: row["time_dimension"] as string | undefined,
        dimension: "metric",
        metric: typeof value === "number" ? value : 0,
      } satisfies DataPoint;
    });
  }, [queryResult.data, measure, aggregation]);

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
          <Select
            value={rangePreset}
            onValueChange={(value) =>
              setRangePreset(value as PreviewRangePreset)
            }
          >
            <SelectTrigger className="h-8 w-auto gap-2 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {previewRangePresets.map((preset) => (
                <SelectItem key={preset} value={preset} className="text-xs">
                  {TIME_RANGES[preset].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
