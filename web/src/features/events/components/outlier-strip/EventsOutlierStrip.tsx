import { useMemo, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { type FilterState, type QueryType } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { useElementSize } from "@/src/hooks/useElementSize";
import useLocalStorage from "@/src/components/useLocalStorage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { toChartFilters } from "@/src/features/chart-view/lib/chartFilterCompatibility";
import { OutlierBarStrip } from "./OutlierBarStrip";
import {
  OUTLIER_STRIP_METRICS,
  pickChartGranularity,
  prepareOutlierSeries,
  rowsToOutlierBins,
  type OutlierQueryRow,
  type OutlierStripCostAgg,
  type OutlierStripLatencyAgg,
  type OutlierStripMetricKey,
} from "./lib/binning";

/**
 * Production container for the outlier strip ("Pulse") above the events table
 * (LFE-14451). Open by default; the X hands control back to the caller, which
 * re-opens it via a toolbar "Pulse" button. One `dashboard.executeQuery` call
 * fetches count + max cost/latency/tokens per time bucket, so switching
 * metrics or the multi-chart layout never refetches. Bucket width adapts to
 * the measured width (space calculator → granularity preset). Clicking a bar
 * narrows the table's time range to that bucket; the browser Back button
 * restores the outer view.
 *
 * Filters forward exactly like the in-view chart (`toChartFilters`): columns
 * the aggregate query can't express — including `isRootObservation` — are
 * silently ignored, matching the analytics surfaces.
 */

/** Target horizontal pixels per bar for granularity picking. */
const BAR_SLOT_TARGET_PX = 5;
/** Each chart needs this much width for Split (all three) to be offered. */
const CHART_MIN_WIDTH_PX = 400;
const CHART_GAP_PX = 24;

const SPLIT_METRICS: OutlierStripMetricKey[] = ["cost", "latency", "tokens"];

/** The dropdown's modes: one metric full-width, or Split = all three. */
type StripMode = OutlierStripMetricKey | "split";

const modeLabel = (mode: StripMode): string =>
  mode === "split" ? "Split" : OUTLIER_STRIP_METRICS[mode].shortLabel;

const AggDropdown = <T extends string>({
  metricLabel,
  value,
  options,
  onChange,
}: {
  metricLabel: string;
  value: T;
  options: readonly T[];
  onChange: (agg: T) => void;
}) => (
  <span className="flex items-baseline gap-1">
    {/* The separator dot stays outside the trigger so hover styling
        (underline) applies to the value only. */}
    <span className="text-muted-foreground font-mono text-[10px] leading-none">
      ·
    </span>
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${metricLabel} aggregation: ${value}`}
        className="text-muted-foreground hover:text-foreground flex items-center gap-0.5 font-mono text-[10px] leading-none underline-offset-2 hover:underline"
      >
        {value}
        <ChevronDown className="h-2.5 w-2.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((agg) => (
          <DropdownMenuItem
            key={agg}
            onClick={() => onChange(agg)}
            className="font-mono text-xs"
          >
            {agg}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  </span>
);

const ModeDropdown = ({
  value,
  options,
  onChange,
}: {
  value: StripMode;
  options: StripMode[];
  onChange: (mode: StripMode) => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      aria-label={`Chart mode: ${modeLabel(value)}`}
      className="text-foreground hover:text-muted-foreground flex items-center gap-0.5 font-mono text-[10px] leading-none font-bold"
    >
      {modeLabel(value)}
      <ChevronDown className="h-2.5 w-2.5" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      {options.map((mode) => (
        <DropdownMenuItem
          key={mode}
          onClick={() => onChange(mode)}
          className="font-mono text-xs"
        >
          {modeLabel(mode)}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

export function EventsOutlierStrip({
  projectId,
  filterState,
  fromTimestamp,
  toTimestamp,
  onSelectRange,
  onClose,
}: {
  projectId: string;
  filterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  onSelectRange: (range: { from: Date; to: Date }) => void;
  onClose: () => void;
}) {
  const [wrapperRef, size] = useElementSize<HTMLDivElement>();
  // Transient drag selection, shared across the sibling charts so a drag on
  // one strip highlights the same time span on all (LF-34, Grafana-style).
  const [dragSelection, setDragSelection] = useState<{
    fromMs: number;
    toMs: number;
  } | null>(null);
  // The chart mode — a per-user preference. "split" degrades to Cost when the
  // width can't fit three charts, WITHOUT overwriting the stored choice, so
  // widening the window restores Split.
  const [modeStored, setMode] = useLocalStorage<StripMode>(
    "events-outlier-strip-mode",
    "cost",
  );
  // Latency-only: which per-bucket aggregate to plot (Max's ask — the label
  // must say whether a bar is max, p95, …; cost/tokens are always max).
  const [latencyAggStored, setLatencyAgg] =
    useLocalStorage<OutlierStripLatencyAgg>(
      "events-outlier-strip-latency-agg",
      "max",
    );
  const latencyAgg: OutlierStripLatencyAgg =
    latencyAggStored === "p95" || latencyAggStored === "avg"
      ? latencyAggStored
      : "max";
  // Cost: worst single event (max, the outlier default) or total spend.
  const [costAggStored, setCostAgg] = useLocalStorage<OutlierStripCostAgg>(
    "events-outlier-strip-cost-agg",
    "max",
  );
  const costAgg: OutlierStripCostAgg =
    costAggStored === "total" ? "total" : "max";
  const fromMs = fromTimestamp.getTime();
  const toMs = toTimestamp.getTime();
  const validRange = fromMs < toMs;
  // getBoundingClientRect includes the wrapper's px-2 padding (border-box).
  const width = Math.max((size?.width ?? 0) - 16, 0);

  // Split adapts: 3 charts when they fit, 2 (Cost + Latency) on smaller
  // widths, and only below the 2-chart threshold does Split leave the menu.
  const splitChartCount = Math.min(
    SPLIT_METRICS.length,
    Math.floor((width + CHART_GAP_PX) / (CHART_MIN_WIDTH_PX + CHART_GAP_PX)),
  );
  const splitFits = splitChartCount >= 2;
  // Sanitize: localStorage is user-editable; unknown values fall back to Cost.
  const storedMode: StripMode =
    modeStored === "split" ||
    (typeof modeStored === "string" && modeStored in OUTLIER_STRIP_METRICS)
      ? modeStored
      : "cost";
  const mode: StripMode =
    storedMode === "split" && !splitFits ? "cost" : storedMode;
  const modeOptions: StripMode[] = splitFits
    ? [...SPLIT_METRICS, "split"]
    : [...SPLIT_METRICS];

  const visibleMetrics: OutlierStripMetricKey[] =
    mode === "split" ? SPLIT_METRICS.slice(0, splitChartCount) : [mode];
  const chartCount = visibleMetrics.length;
  const chartWidth = (width - CHART_GAP_PX * (chartCount - 1)) / chartCount;

  const granularity = pickChartGranularity({
    rangeMs: toMs - fromMs,
    widthPx: Math.max(chartWidth, 1),
    barSlotPx: BAR_SLOT_TARGET_PX,
  });

  const filters = useMemo(() => toChartFilters(filterState), [filterState]);

  const query: QueryType = useMemo(
    () => ({
      view: "observations",
      dimensions: [],
      // All metrics in one scan so metric switching / multi-chart never refetch.
      metrics: [
        { measure: "count", aggregation: "count" },
        { measure: "totalCost", aggregation: "max" },
        { measure: "totalCost", aggregation: "sum" },
        { measure: "latency", aggregation: "max" },
        { measure: "latency", aggregation: "p95" },
        { measure: "latency", aggregation: "avg" },
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

  const series = useMemo(
    () =>
      (mode === "split" ? SPLIT_METRICS.slice(0, splitChartCount) : [mode]).map(
        (metric) =>
          prepareOutlierSeries({
            bins,
            metric,
            latencyAgg,
            fromMs,
            toMs,
            stepSeconds: granularity.stepSeconds,
          }),
      ),
    [
      bins,
      fromMs,
      toMs,
      granularity.stepSeconds,
      mode,
      splitChartCount,
      latencyAgg,
    ],
  );

  const handleSelectBucket = (range: { fromMs: number; toMs: number }) => {
    onSelectRange({ from: new Date(range.fromMs), to: new Date(range.toMs) });
  };

  const stepMs = granularity.stepSeconds * 1000;
  // Held-over bins from a different window can miss the new grid entirely;
  // that must render as "loading", never as a false "No events in range".
  const placeholderMissesGrid =
    queryResult.isPlaceholderData &&
    series.every(
      (s) => s.maxValue === 0 && s.dense.every((bin) => bin.count === 0),
    );
  const isLoading =
    validRange &&
    width > 0 &&
    ((queryResult.isPending && !queryResult.isError) || placeholderMissesGrid);

  // First paint renders nothing inside the measuring wrapper: the bucket size
  // needs the width, so painting before the first measurement would flash a
  // skeleton sized for nothing.
  return (
    <div ref={wrapperRef} className="shrink-0 border-b">
      {size === undefined ? null : (
        <div className="relative px-2 pt-1 pb-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close Pulse chart"
            onClick={onClose}
            className="text-muted-foreground absolute top-0.5 right-1 z-[1] h-6 w-6"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
          {isLoading || width === 0 ? (
            <div className="bg-muted h-[66px] animate-pulse rounded" />
          ) : queryResult.isError ? (
            <div className="text-muted-foreground flex h-[66px] items-center justify-center text-[10px]">
              Could not load the outlier chart for the current view.
            </div>
          ) : (
            <div
              // Dim held-over bins during a refetch (filter change, saved-view
              // switch, drill-in) — stale data must not read as current.
              className={cn(
                "flex transition-opacity",
                queryResult.isPlaceholderData &&
                  queryResult.isFetching &&
                  "opacity-60",
              )}
              style={{ gap: CHART_GAP_PX }}
            >
              {visibleMetrics.map((metric, slot) => (
                <div key={slot} className="min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    {slot === 0 ? (
                      <>
                        <ModeDropdown
                          value={mode}
                          options={modeOptions}
                          onChange={setMode}
                        />
                        {mode === "split" && (
                          <span className="text-muted-foreground font-mono text-[10px] leading-none">
                            {OUTLIER_STRIP_METRICS[metric].shortLabel}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground font-mono text-[10px] leading-none">
                        {OUTLIER_STRIP_METRICS[metric].shortLabel}
                      </span>
                    )}
                    {/* The bar's aggregate must be legible (max vs p95, …);
                        latency and cost offer choices, tokens is max. */}
                    {metric === "latency" ? (
                      <AggDropdown
                        metricLabel="Latency"
                        value={latencyAgg}
                        options={["max", "p95", "avg"] as const}
                        onChange={setLatencyAgg}
                      />
                    ) : metric === "cost" ? (
                      <AggDropdown
                        metricLabel="Cost"
                        value={costAgg}
                        options={["max", "total"] as const}
                        onChange={setCostAgg}
                      />
                    ) : (
                      <span className="text-muted-foreground/70 font-mono text-[10px] leading-none">
                        · max
                      </span>
                    )}
                  </div>
                  <OutlierBarStrip
                    className="mt-1"
                    dense={series[slot].dense}
                    maxValue={series[slot].maxValue}
                    stepMs={stepMs}
                    metric={metric}
                    widthPx={chartWidth}
                    onSelectBucket={handleSelectBucket}
                    selection={dragSelection}
                    onSelectionChange={setDragSelection}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
