import { useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { type FilterState, type QueryType } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { useElementSize } from "@/src/hooks/useElementSize";
import useLocalStorage from "@/src/components/useLocalStorage";
import { useIsMobile } from "@/src/hooks/use-mobile";
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
  type OutlierStripMetricKey,
} from "./lib/binning";

/**
 * Production container for the outlier strip above the events table
 * (LFE-14451). Always on (no toolbar toggle): expanded by default where there
 * is space, collapsed to a slim "Pulse" bar on mobile — the
 * session-view "Session controls" accordion pattern. One
 * `dashboard.executeQuery` call fetches count + max cost/latency/tokens per
 * time bucket, so switching metrics or the multi-chart layout never
 * refetches. Bucket width adapts to the measured width (space calculator →
 * granularity preset). Clicking a bar narrows the table's time range to that
 * bucket; the browser Back button restores the outer view.
 *
 * Filters forward exactly like the in-view chart (`toChartFilters`): columns
 * the aggregate query can't express — including `isRootObservation` — are
 * silently ignored, matching the analytics surfaces.
 */

/** Target horizontal pixels per bar for granularity picking. */
const BAR_SLOT_TARGET_PX = 5;
/** Each chart needs this much width; up to three charts side by side. */
const CHART_MIN_WIDTH_PX = 400;
const MAX_CHARTS = 3;
const CHART_GAP_PX = 24;

const DEFAULT_SLOT_METRICS: OutlierStripMetricKey[] = [
  "cost",
  "latency",
  "tokens",
];

const MetricDropdown = ({
  value,
  onChange,
}: {
  value: OutlierStripMetricKey;
  onChange: (metric: OutlierStripMetricKey) => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger className="text-foreground hover:text-muted-foreground flex items-center gap-0.5 font-mono text-[10px] leading-none font-bold">
      {OUTLIER_STRIP_METRICS[value].shortLabel}
      <ChevronDown className="h-2.5 w-2.5" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      {(Object.keys(OUTLIER_STRIP_METRICS) as OutlierStripMetricKey[]).map(
        (key) => (
          <DropdownMenuItem
            key={key}
            onClick={() => onChange(key)}
            className="font-mono text-xs"
          >
            {OUTLIER_STRIP_METRICS[key].shortLabel}
          </DropdownMenuItem>
        ),
      )}
    </DropdownMenuContent>
  </DropdownMenu>
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
  const isMobile = useIsMobile();
  const [wrapperRef, size] = useElementSize<HTMLDivElement>();
  // Which metric each chart slot shows — a per-user preference.
  const [slotMetrics, setSlotMetrics] = useLocalStorage<
    OutlierStripMetricKey[]
  >("events-outlier-strip-metrics", DEFAULT_SLOT_METRICS);
  // null = no explicit choice yet: open where there is space, closed on mobile.
  const [collapsedStored, setCollapsed] = useLocalStorage<boolean | null>(
    "events-outlier-strip-collapsed",
    null,
  );
  const collapsed = collapsedStored ?? isMobile;

  const fromMs = fromTimestamp.getTime();
  const toMs = toTimestamp.getTime();
  const validRange = fromMs < toMs;
  // getBoundingClientRect includes the wrapper's px-2 padding (border-box).
  const width = Math.max((size?.width ?? 0) - 16, 0);

  const chartCount = Math.max(
    1,
    Math.min(
      Math.floor((width + CHART_GAP_PX) / (CHART_MIN_WIDTH_PX + CHART_GAP_PX)),
      MAX_CHARTS,
    ),
  );
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
      enabled: validRange && width > 0 && !collapsed,
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

  // Sanitize ONCE: localStorage is user-editable and cross-tab-writable; any
  // valid-JSON wrong shape (a bare string, wrong casing, a number) would
  // otherwise crash OUTLIER_STRIP_METRICS lookups or the spread in
  // setSlotMetric on every page load until hand-cleared.
  const safeSlotMetrics = useMemo<OutlierStripMetricKey[]>(
    () =>
      Array.isArray(slotMetrics)
        ? slotMetrics.map((stored, i) =>
            typeof stored === "string" && stored in OUTLIER_STRIP_METRICS
              ? (stored as OutlierStripMetricKey)
              : DEFAULT_SLOT_METRICS[i % 3],
          )
        : DEFAULT_SLOT_METRICS,
    [slotMetrics],
  );

  const visibleMetrics = useMemo(
    () =>
      Array.from(
        { length: chartCount },
        (_, i) => safeSlotMetrics[i] ?? DEFAULT_SLOT_METRICS[i % 3],
      ),
    [chartCount, safeSlotMetrics],
  );

  const series = useMemo(
    () =>
      visibleMetrics.map((metric) =>
        prepareOutlierSeries({
          bins,
          metric,
          fromMs,
          toMs,
          stepSeconds: granularity.stepSeconds,
        }),
      ),
    [bins, fromMs, toMs, granularity.stepSeconds, visibleMetrics],
  );

  const handleSelectBucket = (range: { fromMs: number; toMs: number }) => {
    onSelectRange({ from: new Date(range.fromMs), to: new Date(range.toMs) });
  };

  const setSlotMetric = (slot: number, metric: OutlierStripMetricKey) => {
    const base = [...safeSlotMetrics];
    while (base.length < MAX_CHARTS)
      base.push(DEFAULT_SLOT_METRICS[base.length]);
    base[slot] = metric;
    setSlotMetrics(base);
  };

  const stepMs = granularity.stepSeconds * 1000;
  const isLoading =
    validRange && width > 0 && queryResult.isPending && !queryResult.isError;

  // The measuring wrapper stays mounted in BOTH states: useElementSize
  // observes its element once on mount, so unmounting it while collapsed
  // would freeze the measured width forever after re-expanding.
  return (
    <div ref={wrapperRef} className="shrink-0 border-b">
      {collapsed ? (
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setCollapsed(false)}
          className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-3 py-1 text-[11px]"
        >
          <span>Pulse</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      ) : (
        <div className="relative px-2 pt-1 pb-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Collapse outlier chart"
            onClick={() => setCollapsed(true)}
            className="text-muted-foreground absolute top-0.5 right-1 z-[1] h-5 w-5"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          {isLoading || width === 0 ? (
            <div className="bg-muted h-[66px] animate-pulse rounded" />
          ) : queryResult.isError ? (
            <div className="text-muted-foreground flex h-[66px] items-center justify-center text-[10px]">
              Couldn&apos;t load the outlier chart for the current view.
            </div>
          ) : (
            <div className="flex" style={{ gap: CHART_GAP_PX }}>
              {visibleMetrics.map((metric, slot) => (
                <div key={slot} className="min-w-0">
                  <MetricDropdown
                    value={metric}
                    onChange={(next) => setSlotMetric(slot, next)}
                  />
                  <OutlierBarStrip
                    className="mt-1"
                    dense={series[slot].dense}
                    maxValue={series[slot].maxValue}
                    stepMs={stepMs}
                    metric={metric}
                    widthPx={chartWidth}
                    onSelectBucket={handleSelectBucket}
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
