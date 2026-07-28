import { useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { type FilterState, type QueryType } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { useElementSize } from "@/src/hooks/useElementSize";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  chartFilterExclusionReason,
  toChartFilters,
} from "@/src/features/chart-view/lib/chartFilterCompatibility";
import { OutlierBarStrip } from "./OutlierBarStrip";
import {
  OUTLIER_STRIP_METRICS,
  outlierStripQueryMetrics,
  pickChartGranularity,
  prepareOutlierSeries,
  rowsToOutlierBins,
  type OutlierQueryRow,
  type OutlierStripAggKey,
  type OutlierStripMetricKey,
} from "./lib/binning";
import {
  useOutlierStripSettings,
  type OutlierStripSettings,
} from "./lib/useOutlierStripSettings";

/**
 * Production container for the outlier strip ("Pulse") above the events table
 * (LFE-14451). Always visible. One `dashboard.executeQuery` call
 * fetches count + every registered aggregate per time bucket (see the metric
 * registry in lib/binning.ts), so switching metrics or aggregations never
 * refetches. Bucket width adapts to the measured
 * width (space calculator → granularity preset). Clicking a bar narrows the
 * table's time range to that bucket; the browser Back button restores the
 * outer view.
 *
 * Filters forward exactly like the in-view chart (`toChartFilters`); filters
 * the aggregate query can't express are disclosed by a small "not applied"
 * hint on the strip (unlike chart mode's sidebar dimming: here the TABLE
 * still honors those filters, only the strip doesn't).
 */

/** Target horizontal pixels per bar for granularity picking. */
const BAR_SLOT_TARGET_PX = 5;

type StripMode = OutlierStripSettings["mode"];

const MODE_OPTIONS: StripMode[] = ["cost", "latency"];

const modeLabel = (mode: StripMode): string =>
  OUTLIER_STRIP_METRICS[mode].shortLabel;

/**
 * Prevent Radix's close-refocus ONLY after a pointer-driven selection — the
 * programmatic refocus renders as a keyboard-style outline on the trigger.
 * Escape / click-outside / keyboard selection keep the default focus return
 * so keyboard users aren't dropped onto <body> (mirrors ChatMessages,
 * LFE-6864).
 */
const usePointerSelectionFocusGuard = () => {
  const selectedViaPointerRef = useRef(false);
  return {
    markPointerSelection: (event: { detail: number }) => {
      // Keyboard-synthesized clicks carry detail 0; real pointer clicks ≥ 1.
      if (event.detail > 0) selectedViaPointerRef.current = true;
    },
    onCloseAutoFocus: (event: Event) => {
      if (selectedViaPointerRef.current) {
        event.preventDefault();
        selectedViaPointerRef.current = false;
      }
    },
  };
};

const AggDropdown = ({
  metricLabel,
  value,
  options,
  onChange,
}: {
  metricLabel: string;
  value: OutlierStripAggKey;
  options: readonly OutlierStripAggKey[];
  onChange: (agg: OutlierStripAggKey) => void;
}) => {
  const focusGuard = usePointerSelectionFocusGuard();
  return (
    <span className="flex items-baseline gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${metricLabel} aggregation: ${value}`}
          className="text-muted-foreground hover:text-foreground flex items-center gap-0.5 text-[13px] leading-none underline-offset-2 hover:underline"
        >
          {value}
          <ChevronDown className="h-2.5 w-2.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          onCloseAutoFocus={focusGuard.onCloseAutoFocus}
        >
          {options.map((agg) => (
            <DropdownMenuItem
              key={agg}
              onClick={(event) => {
                focusGuard.markPointerSelection(event);
                onChange(agg);
              }}
              className="text-xs"
            >
              {agg}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
};

const ModeDropdown = ({
  value,
  options,
  onChange,
}: {
  value: StripMode;
  options: StripMode[];
  onChange: (mode: StripMode) => void;
}) => {
  const focusGuard = usePointerSelectionFocusGuard();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Chart mode: ${modeLabel(value)}`}
        className="text-foreground hover:text-muted-foreground flex items-center gap-0.5 text-[13px] leading-none font-bold"
      >
        {modeLabel(value)}
        <ChevronDown className="h-2.5 w-2.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        onCloseAutoFocus={focusGuard.onCloseAutoFocus}
      >
        {options.map((mode) => (
          <DropdownMenuItem
            key={mode}
            onClick={(event) => {
              focusGuard.markPointerSelection(event);
              onChange(mode);
            }}
            className="text-xs"
          >
            {modeLabel(mode)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/** Filters the strip's aggregate query cannot express — excluding the ones
 * whose dropping is by design (the explicit from/to carries startTime; root
 * scoping is deliberately ignored per the LFE-14451 product call).
 * `has:`/`-has:` presence filters (type "null") are dropped by toChartFilters
 * even on forwardable columns, so they count regardless of column. */
const countIgnoredFilters = (filterState: FilterState): number =>
  filterState.filter(
    (f) =>
      !(f.type === "datetime" && f.column === "startTime") &&
      f.column !== "isRootObservation" &&
      f.column !== "hasParentObservation" &&
      (f.type === "null" || chartFilterExclusionReason(f.column) !== null),
  ).length;

export function EventsOutlierStrip({
  projectId,
  filterState,
  fromTimestamp,
  toTimestamp,
  searchIgnored = false,
  onSelectRange,
}: {
  projectId: string;
  filterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  /** The table has an active free-text search the strip cannot apply. */
  searchIgnored?: boolean;
  onSelectRange: (range: { from: Date; to: Date }) => void;
}) {
  const [wrapperRef, size] = useElementSize<HTMLDivElement>();
  // Transient drag selection (LFE-14532, Grafana-style). Window-keyed: a
  // range/granularity change (drill, browser back/forward) invalidates a
  // lingering band by derivation.
  const [dragSelection, setDragSelection] = useState<{
    fromMs: number;
    toMs: number;
    windowKey: string;
  } | null>(null);
  const { settings, update } = useOutlierStripSettings();

  const fromMs = fromTimestamp.getTime();
  const toMs = toTimestamp.getTime();
  const validRange = fromMs < toMs;
  // getBoundingClientRect includes the wrapper's px-2 padding (border-box).
  const width = Math.max((size?.width ?? 0) - 16, 0);

  const mode: StripMode = settings.mode;
  const chartWidth = width;
  const def = OUTLIER_STRIP_METRICS[mode];
  const aggOptions = def.aggregations.map((agg) => agg.key);

  const granularity = pickChartGranularity({
    rangeMs: toMs - fromMs,
    widthPx: Math.max(chartWidth, 1),
    barSlotPx: BAR_SLOT_TARGET_PX,
  });

  const filters = useMemo(() => toChartFilters(filterState), [filterState]);
  const ignoredFilterCount =
    countIgnoredFilters(filterState) + (searchIgnored ? 1 : 0);

  const query: QueryType = useMemo(
    () => ({
      view: "observations",
      dimensions: [],
      // Every registered aggregate in one scan (registry-derived), so metric
      // and aggregation switching never refetch.
      metrics: outlierStripQueryMetrics(),
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

  const aggregationFor = (metric: OutlierStripMetricKey): OutlierStripAggKey =>
    metric === "latency" ? settings.latencyAgg : settings.costAgg;

  const series = useMemo(
    () =>
      prepareOutlierSeries({
        bins,
        metric: mode,
        aggregation:
          mode === "latency" ? settings.latencyAgg : settings.costAgg,
        fromMs,
        toMs,
        stepSeconds: granularity.stepSeconds,
        widthPx: chartWidth,
      }),
    [
      bins,
      fromMs,
      toMs,
      granularity.stepSeconds,
      mode,
      settings.latencyAgg,
      settings.costAgg,
      chartWidth,
    ],
  );

  const handleSelectBucket = (range: { fromMs: number; toMs: number }) => {
    onSelectRange({ from: new Date(range.fromMs), to: new Date(range.toMs) });
  };

  const setAggregation = (
    metric: OutlierStripMetricKey,
    agg: OutlierStripAggKey,
  ) => {
    if (metric === "latency") {
      update({ latencyAgg: agg as OutlierStripSettings["latencyAgg"] });
    } else if (metric === "cost") {
      update({ costAgg: agg as OutlierStripSettings["costAgg"] });
    }
  };

  const stepMs = granularity.stepSeconds * 1000;
  const selectionWindowKey = `${fromMs}:${toMs}:${stepMs}`;
  const activeSelection =
    dragSelection && dragSelection.windowKey === selectionWindowKey
      ? dragSelection
      : null;
  const handleSelectionChange = (
    range: { fromMs: number; toMs: number } | null,
  ) =>
    setDragSelection(
      range ? { ...range, windowKey: selectionWindowKey } : null,
    );
  // Held-over bins from a different window can miss the new grid entirely;
  // that must render as "loading", never as a false "No events in range".
  const placeholderMissesGrid =
    queryResult.isPlaceholderData &&
    series.maxValue === 0 &&
    series.dense.every((bin) => bin.count === 0);
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
          {isLoading || width === 0 ? (
            <div className="bg-muted h-[76px] animate-pulse rounded" />
          ) : queryResult.isError ? (
            <div className="text-muted-foreground flex h-[76px] items-center justify-center text-[11px]">
              No Data
            </div>
          ) : (
            <div
              // Dim held-over bins during a refetch (filter change, saved-view
              // switch, drill-in) — stale data must not read as current.
              className={cn(
                "min-w-0 transition-opacity",
                queryResult.isPlaceholderData &&
                  queryResult.isFetching &&
                  "opacity-60",
              )}
            >
              <div className="flex items-baseline gap-1.5">
                <ModeDropdown
                  value={mode}
                  options={MODE_OPTIONS}
                  onChange={(next) => update({ mode: next })}
                />
                {/* The bar's aggregate must be legible where there is a
                    choice (p95 vs avg); single-option metrics are
                    unambiguous and render no aggregation label. */}
                {aggOptions.length > 1 && (
                  <AggDropdown
                    metricLabel={def.shortLabel}
                    value={aggregationFor(mode)}
                    options={aggOptions}
                    onChange={(agg) => setAggregation(mode, agg)}
                  />
                )}
                {/* Unlike full chart mode (which dims sidebar facets),
                    the TABLE still honors these filters — only the strip
                    can't express them, so the disclosure lives here. */}
                {ignoredFilterCount > 0 && (
                  <span
                    className="text-muted-foreground/70 text-[11px] leading-none"
                    title="Some active filters (measures, scores, comments, metadata, free-text search) cannot be applied to this chart's aggregate query. The table still honors them; the chart shows the unfiltered distribution for those."
                  >
                    · {ignoredFilterCount} filter
                    {ignoredFilterCount > 1 ? "s" : ""} not applied
                  </span>
                )}
              </div>
              <OutlierBarStrip
                className="mt-2"
                dense={series.dense}
                maxValue={series.maxValue}
                ticks={series.ticks}
                stepMs={stepMs}
                metric={mode}
                widthPx={chartWidth}
                onSelectBucket={handleSelectBucket}
                selection={activeSelection}
                onSelectionChange={handleSelectionChange}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
