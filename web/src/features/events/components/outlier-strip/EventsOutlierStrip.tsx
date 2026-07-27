import { useMemo, useState } from "react";
import { type FilterState, type QueryType } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { useElementSize } from "@/src/hooks/useElementSize";
import { toChartFilters } from "@/src/features/chart-view/lib/chartFilterCompatibility";
import { OutlierBarStrip } from "./OutlierBarStrip";
import {
  OUTLIER_STRIP_METRICS,
  pickChartGranularity,
  prepareOutlierSeries,
  rowsToOutlierBins,
  type OutlierQueryRow,
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
  // getBoundingClientRect includes the wrapper's px-2 padding (border-box) —
  // subtract it so the strips never overhang the content box.
  const width = Math.max((size?.width ?? 0) - 16, 0);
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
      // Keep the previous bins on refetch (auto-refresh ticks re-key the query
      // via the re-evaluated relative window) — a persistent band must not
      // flash to a skeleton every interval.
      placeholderData: (prev) => prev,
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

  // Fit the slots to the actual bucket count: stretch (up to 80px) when a
  // drilled range yields few buckets — Firefox-devtools style — and shrink
  // below the 5px target when the coarsest granularity still overflows the
  // width (wide custom ranges), so the newest buckets are never clipped away.
  const barSlotPx = Math.min(
    Math.max(
      1,
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
