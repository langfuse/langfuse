import { useMemo, useState } from "react";
import { type FilterState, type QueryType } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { useElementSize } from "@/src/hooks/useElementSize";
import { toChartFilters } from "@/src/features/chart-view/lib/chartFilterCompatibility";
import { parseChartTimestamp } from "@/src/features/widgets/chart-library/prepareTimeAxis";
import { OutlierBarStrip } from "./OutlierBarStrip";
import {
  OUTLIER_STRIP_METRICS,
  pickChartGranularity,
  prepareOutlierSeries,
  type OutlierStripBin,
  type OutlierStripMetricKey,
} from "./lib/binning";

/**
 * Production container for the outlier strip above the events table
 * (LFE-14451). One `dashboard.executeQuery` call fetches count + max
 * cost/latency/tokens per time bucket — switching metrics or showing two
 * charts never refetches. The bucket width adapts to the measured strip width
 * (space calculator → granularity preset). Clicking a bar narrows the table's
 * time range to that bucket; the browser Back button restores the outer view.
 *
 * Filters forward exactly like the in-view chart (`toChartFilters`): columns
 * the aggregate query can't express — including `isRootObservation` — are
 * silently ignored, matching the analytics surfaces.
 */

const BAR_SLOT_PX = 5;
/** Show Cost + Latency side by side when both get a useful width. */
const TWO_UP_MIN_WIDTH_PX = 880;
const TWO_UP_GAP_PX = 24;

/** executeQuery result column names: `${aggregation}_${measure}`. */
type OutlierQueryRow = {
  time_dimension?: string;
  count_count?: unknown;
  max_totalCost?: unknown;
  max_latency?: unknown;
  max_totalTokens?: unknown;
};

const toNumberOrNull = (raw: unknown): number | null =>
  raw === null || raw === undefined ? null : Number(raw);

/** Maps executeQuery rows to strip bins; latency arrives in ms, bins carry s. */
export const rowsToOutlierBins = (rows: OutlierQueryRow[]): OutlierStripBin[] =>
  rows.flatMap((row) => {
    const bucketStart = parseChartTimestamp(row.time_dimension);
    if (!bucketStart) return [];
    const latencyMs = toNumberOrNull(row.max_latency);
    return [
      {
        bucketStart,
        count: Number(row.count_count ?? 0),
        maxTotalCost: toNumberOrNull(row.max_totalCost),
        maxLatencySeconds: latencyMs === null ? null : latencyMs / 1000,
        maxTotalTokens: toNumberOrNull(row.max_totalTokens),
      },
    ];
  });

const MetricSwitcher = ({
  value,
  onChange,
}: {
  value: OutlierStripMetricKey;
  onChange: (metric: OutlierStripMetricKey) => void;
}) => (
  <div className="flex items-center gap-2">
    {(Object.keys(OUTLIER_STRIP_METRICS) as OutlierStripMetricKey[]).map(
      (key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "font-mono text-[10px] leading-none transition-colors",
            value === key
              ? "text-foreground font-bold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {OUTLIER_STRIP_METRICS[key].shortLabel}
        </button>
      ),
    )}
  </div>
);

export function EventsOutlierStrip({
  projectId,
  filterState,
  fromTimestamp,
  toTimestamp,
  onSelectRange,
}: {
  projectId: string;
  filterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  onSelectRange: (range: { from: Date; to: Date }) => void;
}) {
  const [wrapperRef, size] = useElementSize<HTMLDivElement>();
  const [primaryMetric, setPrimaryMetric] =
    useState<OutlierStripMetricKey>("cost");
  const [secondaryMetric, setSecondaryMetric] =
    useState<OutlierStripMetricKey>("latency");

  const fromMs = fromTimestamp.getTime();
  const toMs = toTimestamp.getTime();
  const validRange = fromMs < toMs;
  const width = size?.width ?? 0;
  const twoUp = width >= TWO_UP_MIN_WIDTH_PX;
  const chartWidth = twoUp ? (width - TWO_UP_GAP_PX) / 2 : width;

  const granularity = pickChartGranularity({
    rangeMs: toMs - fromMs,
    widthPx: Math.max(chartWidth, 1),
    barSlotPx: BAR_SLOT_PX,
  });

  const filters = useMemo(() => toChartFilters(filterState), [filterState]);

  const query: QueryType = useMemo(
    () => ({
      view: "observations",
      dimensions: [],
      // All metrics in one scan so metric switching / 2-up never refetch.
      metrics: [
        { measure: "count", aggregation: "count" },
        { measure: "totalCost", aggregation: "max" },
        { measure: "latency", aggregation: "max" },
        { measure: "totalTokens", aggregation: "max" },
      ],
      filters,
      timeDimension: { granularity: granularity.granularity },
      fromTimestamp: fromTimestamp.toISOString(),
      toTimestamp: toTimestamp.toISOString(),
      // Must stay null: an orderBy disables the WITH FILL densification.
      orderBy: null,
    }),
    [filters, granularity.granularity, fromTimestamp, toTimestamp],
  );

  const queryResult = api.dashboard.executeQuery.useQuery(
    { projectId, query, version: "v2" },
    {
      // Wait for the first width measurement — it decides the bucket size.
      enabled: validRange && width > 0,
      meta: { silentHttpCodes: [422] },
      trpc: { context: { skipBatch: true } },
    },
  );

  const bins = useMemo(
    () =>
      queryResult.data
        ? rowsToOutlierBins(queryResult.data as OutlierQueryRow[])
        : [],
    [queryResult.data],
  );

  const series = useMemo(() => {
    const prepare = (metric: OutlierStripMetricKey) =>
      prepareOutlierSeries({
        bins,
        metric,
        fromMs,
        toMs,
        stepSeconds: granularity.stepSeconds,
      });
    return {
      primary: prepare(primaryMetric),
      secondary: twoUp ? prepare(secondaryMetric) : null,
    };
  }, [
    bins,
    fromMs,
    toMs,
    granularity.stepSeconds,
    primaryMetric,
    secondaryMetric,
    twoUp,
  ]);

  const handleSelectBucket = (range: { fromMs: number; toMs: number }) => {
    onSelectRange({ from: new Date(range.fromMs), to: new Date(range.toMs) });
  };

  // When the range yields fewer buckets than fit (e.g. right after a drill-in,
  // where `minute` is the finest granularity the backend offers), stretch the
  // bars to fill the width — Firefox-devtools style — instead of rendering a
  // tiny stub in a mostly-empty strip.
  const barSlotPx = Math.min(
    Math.max(
      BAR_SLOT_PX,
      Math.floor(chartWidth / Math.max(series.primary.dense.length, 1)),
    ),
    80,
  );

  const stepMs = granularity.stepSeconds * 1000;
  const isLoading =
    validRange && width > 0 && queryResult.isPending && !queryResult.isError;

  return (
    <div
      ref={wrapperRef}
      className="shrink-0 overflow-hidden border-b px-2 pt-1.5 pb-1"
    >
      {isLoading || width === 0 ? (
        <div className="bg-muted h-[70px] animate-pulse rounded" />
      ) : queryResult.isError ? (
        <div className="text-muted-foreground flex h-[70px] items-center justify-center text-[10px]">
          Couldn&apos;t load the outlier chart for the current view.
        </div>
      ) : (
        <div className="flex" style={{ gap: TWO_UP_GAP_PX }}>
          <div className="min-w-0">
            <MetricSwitcher value={primaryMetric} onChange={setPrimaryMetric} />
            <OutlierBarStrip
              className="mt-1"
              dense={series.primary.dense}
              maxValue={series.primary.maxValue}
              stepMs={stepMs}
              metric={primaryMetric}
              barSlotPx={barSlotPx}
              onSelectBucket={handleSelectBucket}
            />
          </div>
          {twoUp && series.secondary && (
            <div className="min-w-0">
              <MetricSwitcher
                value={secondaryMetric}
                onChange={setSecondaryMetric}
              />
              <OutlierBarStrip
                className="mt-1"
                dense={series.secondary.dense}
                maxValue={series.secondary.maxValue}
                stepMs={stepMs}
                metric={secondaryMetric}
                barSlotPx={barSlotPx}
                onSelectBucket={handleSelectBucket}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
