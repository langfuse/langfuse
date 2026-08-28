import { useMemo, useState } from "react";
import type * as React from "react";
import { type FilterState, type QueryType } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { useElementSize } from "@/src/hooks/useElementSize";
import {
  MetricStripBand,
  MetricStripHeaderRow,
  type MetricStripStatus,
} from "@/src/components/metric-strip/MetricStripBand";
import {
  MetricStripTrigger,
  usePointerSelectionFocusGuard,
} from "@/src/components/metric-strip/MetricStripTrigger";
import {
  DropdownMenuController,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { toChartFilters } from "@/src/features/chart-view/lib/chartFilterCompatibility";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  OutlierBarStrip,
  type OutlierStripDrillTrigger,
} from "./OutlierBarStrip";
import {
  canReuseOutlierPlaceholder,
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
import { canApplyOutlierStripFilters } from "./lib/filterCompatibility";

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
 * Filters forward exactly like the in-view chart (`toChartFilters`). If the
 * aggregate query cannot represent the table's complete filter/search state,
 * the query stays disabled rather than reporting a partial distribution.
 */

/** Target horizontal pixels per bar for granularity picking. */
const BAR_SLOT_TARGET_PX = 5;

type StripMode = OutlierStripSettings["mode"];

const MODE_OPTIONS: StripMode[] = ["count", "cost", "latency"];

const modeLabel = (mode: StripMode): string =>
  OUTLIER_STRIP_METRICS[mode].shortLabel;

const AggDropdownController = ({
  children,
  options,
  onChange,
}: {
  children: React.ComponentProps<typeof DropdownMenuController>["children"];
  options: readonly OutlierStripAggKey[];
  onChange: (agg: OutlierStripAggKey) => void;
}) => {
  const focusGuard = usePointerSelectionFocusGuard();
  return (
    <DropdownMenuController
      align="start"
      onCloseAutoFocus={focusGuard.onCloseAutoFocus}
      renderMenu={() => (
        <>
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
        </>
      )}
    >
      {children}
    </DropdownMenuController>
  );
};

const ModeDropdownController = ({
  children,
  options,
  onChange,
}: {
  children: React.ComponentProps<typeof DropdownMenuController>["children"];
  options: StripMode[];
  onChange: (mode: StripMode) => void;
}) => {
  const focusGuard = usePointerSelectionFocusGuard();
  return (
    <DropdownMenuController
      align="start"
      onCloseAutoFocus={focusGuard.onCloseAutoFocus}
      renderMenu={() => (
        <>
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
        </>
      )}
    >
      {children}
    </DropdownMenuController>
  );
};

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
  const capture = usePostHogClientCapture();
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
  const canApplyFilters = canApplyOutlierStripFilters(
    filterState,
    searchIgnored,
  );

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
      // Wait for the first width measurement, and never run a partially
      // filtered query when the table state cannot be represented.
      enabled: validRange && width > 0 && canApplyFilters,
      // Keep the previous bins ONLY across same-grid refetches (auto-refresh
      // ticks re-key the query via the re-evaluated relative window) — a
      // persistent band must not flash to a skeleton every interval. A grid
      // change (drill-in, Back, preset hop) rendered stale bins as misplaced
      // bars for the whole fetch on slow projects (LFE-14575) — those show
      // the skeleton instead.
      placeholderData: (prev, prevQuery) => {
        const prevInput = (
          prevQuery?.queryKey?.[1] as
            | { input?: { query?: QueryType } }
            | undefined
        )?.input?.query;
        if (!prev || !prevInput?.timeDimension) return undefined;
        return canReuseOutlierPlaceholder(
          { granularity: prevInput.timeDimension.granularity },
          { granularity: granularity.granularity },
        )
          ? prev
          : undefined;
      },
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

  const aggregationFor = (
    metric: OutlierStripMetricKey,
  ): OutlierStripAggKey => {
    if (metric === "count") return "count";
    return metric === "latency" ? settings.latencyAgg : settings.costAgg;
  };
  const aggregation = aggregationFor(mode);

  const series = useMemo(
    () =>
      prepareOutlierSeries({
        bins,
        metric: mode,
        aggregation,
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
      aggregation,
      chartWidth,
    ],
  );

  // Analytics props are metadata only (enums, counts, the granularity step) —
  // never bucket values or range contents. `isV4` per the filters:* taxonomy
  // convention: the strip only exists on the v4 events table (LFE-10781).
  const handleSelectBucket = (
    range: { fromMs: number; toMs: number },
    meta: { trigger: OutlierStripDrillTrigger },
  ) => {
    capture("pulse:drill_in", {
      trigger: meta.trigger,
      metric: mode,
      aggregation,
      mode,
      stepSeconds: granularity.stepSeconds,
      spanBuckets: Math.max(
        1,
        Math.round(
          (range.toMs - range.fromMs) / (granularity.stepSeconds * 1000),
        ),
      ),
      isV4: true,
    });
    onSelectRange({ from: new Date(range.fromMs), to: new Date(range.toMs) });
  };

  const handleModeChange = (next: StripMode) => {
    if (next === mode) return;
    capture("pulse:mode_switch", {
      mode: next,
      previousMode: mode,
      isV4: true,
    });
    update({ mode: next });
  };

  const setAggregation = (
    metric: OutlierStripMetricKey,
    agg: OutlierStripAggKey,
  ) => {
    if (agg === aggregationFor(metric)) return;
    capture("pulse:aggregation_switch", {
      metric,
      aggregation: agg,
      previousAggregation: aggregationFor(metric),
      isV4: true,
    });
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

  const status: MetricStripStatus = !canApplyFilters
    ? "ready"
    : isLoading || width === 0
      ? "loading"
      : queryResult.isError
        ? "empty"
        : "ready";

  const header = (
    <MetricStripHeaderRow>
      <ModeDropdownController
        options={MODE_OPTIONS}
        onChange={handleModeChange}
      >
        {({ Trigger }) => (
          <Trigger asChild>
            <MetricStripTrigger
              ariaLabel={`Chart mode: ${modeLabel(mode)}`}
              label={modeLabel(mode)}
              variant="metric"
            />
          </Trigger>
        )}
      </ModeDropdownController>
      {/* The bar's aggregate must be legible where there is a choice (p95 vs
          avg); single-option metrics are unambiguous and render no
          aggregation label. A chart that cannot represent the filters is not
          drawn with any aggregate, so it shows none. */}
      {canApplyFilters && aggOptions.length > 1 && (
        <AggDropdownController
          options={aggOptions}
          onChange={(agg) => setAggregation(mode, agg)}
        >
          {({ Trigger }) => (
            <span className="flex items-baseline gap-1">
              <Trigger asChild>
                <MetricStripTrigger
                  ariaLabel={`${def.shortLabel} aggregation: ${aggregation}`}
                  label={aggregation}
                  variant="aggregation"
                />
              </Trigger>
            </span>
          )}
        </AggDropdownController>
      )}
    </MetricStripHeaderRow>
  );

  return (
    <MetricStripBand
      ref={wrapperRef}
      // The bucket size needs the width, so painting before the first
      // measurement would flash a skeleton sized for nothing.
      measured={size !== undefined}
      status={status}
      // Dim held-over bins during a refetch (filter change, saved-view
      // switch, drill-in) — stale data must not read as current.
      stale={queryResult.isPlaceholderData && queryResult.isFetching}
      header={header}
    >
      {!canApplyFilters ? (
        <OutlierBarStrip
          className="mt-1.5"
          dense={[]}
          maxValue={0}
          ticks={[]}
          stepMs={stepMs}
          metric={mode}
          widthPx={chartWidth}
          disabledReason="Chart unavailable for the current filters"
        />
      ) : (
        <OutlierBarStrip
          className="mt-1.5"
          dense={series.dense}
          maxValue={series.maxValue}
          ticks={series.ticks}
          stepMs={stepMs}
          metric={mode}
          widthPx={chartWidth}
          onSelectBucket={handleSelectBucket}
          onPreviewPinned={(trigger) =>
            capture("pulse:preview_pinned", {
              trigger,
              metric: mode,
              isV4: true,
            })
          }
          selection={activeSelection}
          onSelectionChange={handleSelectionChange}
        />
      )}
    </MetricStripBand>
  );
}
