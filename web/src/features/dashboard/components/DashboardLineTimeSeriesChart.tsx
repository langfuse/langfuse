import React, { useMemo } from "react";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { timeSeriesToDataPoints } from "@/src/features/dashboard/lib/chart-data-adapters";
import { type TimeSeriesChartDataPoint } from "@/src/features/dashboard/components/hooks";
import {
  type LegendSummaryMode,
  type MissingBucketValue,
} from "@/src/features/widgets/chart-library/chart-props";

/**
 * Memoized LINE_TIME_SERIES card shared by the dashboard time-series panels.
 *
 * Building `data`/`config`/`chartConfig` inline at each call site produced fresh
 * object literals on every render, which defeated `Chart`'s `React.memo` — and
 * the dashboard query scheduler re-renders the whole page on every queue tick,
 * so the chart subtree reconciled needlessly each time. Centralizing it here,
 * keyed on the raw series plus the primitive label/unit/etc., lets the memo bail
 * whenever nothing actually changed. Callers must pass a STABLE `data` reference
 * (memoize the upstream transform) for the bail to take effect. (LFE-10549)
 */
export const DashboardLineTimeSeriesChart = React.memo(
  function DashboardLineTimeSeriesChart({
    data,
    label,
    unit,
    legendSummary,
    syncId,
    subtleFill,
    missingValue,
  }: {
    data: TimeSeriesChartDataPoint[];
    label?: string;
    unit?: string;
    legendSummary?: LegendSummaryMode;
    syncId?: string;
    subtleFill?: boolean;
    /** See {@link MissingBucketValue}. Defaults to `"gap"`. */
    missingValue?: MissingBucketValue;
  }) {
    const points = useMemo(() => timeSeriesToDataPoints(data), [data]);
    const config = useMemo(
      () => (label ? { metric: { label } } : undefined),
      [label],
    );
    const chartConfig = useMemo(
      () => ({
        type: "LINE_TIME_SERIES" as const,
        unit,
        show_data_point_dots: false,
        subtle_fill: subtleFill,
      }),
      [unit, subtleFill],
    );

    return (
      <Chart
        chartType="LINE_TIME_SERIES"
        data={points}
        config={config}
        rowLimit={100}
        chartConfig={chartConfig}
        legendSummary={legendSummary}
        syncId={syncId}
        missingValue={missingValue}
      />
    );
  },
);
