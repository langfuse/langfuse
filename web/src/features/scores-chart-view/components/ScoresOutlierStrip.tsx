import { useMemo, useState } from "react";
import { type FilterState, type QueryType } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { useElementSize } from "@/src/hooks/useElementSize";
import {
  canReuseOutlierPlaceholder,
  pickChartGranularity,
} from "@/src/features/events/components/outlier-strip/lib/binning";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { ScoreOutlierStripHeader } from "@/src/features/scores-chart-view/components/ScoreOutlierStripHeader";
import { SCORE_OUTLIER_STRIP_METRICS } from "@/src/features/scores-chart-view/constants/scoreOutlierStripMetrics";
import {
  canApplyScoreOutlierStripFilters,
  shouldQueryStringScores,
} from "@/src/features/scores-chart-view/fns/outlierStripFilters";
import {
  prepareScoreOutlierSeries,
  mergeScoreOutlierRows,
  rowsToScoreOutlierBins,
  scoreOutlierStripQueryMetrics,
} from "@/src/features/scores-chart-view/fns/binning/scoreOutlierBinning";
import {
  type ScoreOutlierAggKey,
  type ScoreOutlierMetricKey,
  type ScoreOutlierQueryRow,
} from "@/src/features/scores-chart-view/types";
import { useScoreOutlierStripSettings } from "@/src/features/scores-chart-view/hooks/useScoreOutlierStripSettings";
import {
  ScoreOutlierBarStrip,
  type ScoreOutlierStripDrillTrigger,
} from "@/src/features/scores-chart-view/components/ScoreOutlierBarStrip/ScoreOutlierBarStrip";

/**
 * Production container for the outlier strip ("Pulse") above the scores
 * table — the scores-table analogue of `EventsOutlierStrip`
 * (`@/src/features/events/components/outlier-strip`). Always visible. One
 * `dashboard.executeQuery` call fetches count + every registered aggregate
 * per time bucket, so switching metric or aggregation never refetches.
 * Clicking a bar narrows the table's time range to that bucket.
 *
 * Filters forward through the same `mapLegacyUiTableFilterToView` mapping
 * `ScoresChartView` uses. If the aggregate query cannot represent the
 * table's complete filter state, the query stays disabled rather than
 * reporting a partial distribution.
 */

/** Target horizontal pixels per bar for granularity picking. */
const BAR_SLOT_TARGET_PX = 5;

type StripMode = ScoreOutlierMetricKey;

export function ScoresOutlierStrip({
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
  const capture = usePostHogClientCapture();
  const [wrapperRef, size] = useElementSize<HTMLDivElement>();
  // Transient drag selection, window-keyed: a range/granularity change
  // (drill, browser back/forward) invalidates a lingering band by derivation.
  const [dragSelection, setDragSelection] = useState<{
    fromMs: number;
    toMs: number;
    windowKey: string;
  } | null>(null);
  const { settings, update } = useScoreOutlierStripSettings();

  const fromMs = fromTimestamp.getTime();
  const toMs = toTimestamp.getTime();
  const validRange = fromMs < toMs;
  // getBoundingClientRect includes the wrapper's px-2 padding (border-box).
  const width = Math.max((size?.width ?? 0) - 16, 0);

  const mode: StripMode = settings.mode;
  const chartWidth = width;
  const def = SCORE_OUTLIER_STRIP_METRICS[mode];
  const aggOptions = def.aggregations.map((agg) => agg.key);

  const granularity = pickChartGranularity({
    rangeMs: toMs - fromMs,
    widthPx: Math.max(chartWidth, 1),
    barSlotPx: BAR_SLOT_TARGET_PX,
  });

  const numericFilters = useMemo(
    () => mapLegacyUiTableFilterToView("scores-numeric", filterState),
    [filterState],
  );
  const stringFilters = useMemo(
    () => mapLegacyUiTableFilterToView("scores-categorical", filterState),
    [filterState],
  );
  const canApplyFilters = canApplyScoreOutlierStripFilters(filterState);
  const queryStringScores = shouldQueryStringScores(filterState);

  const numericQuery: QueryType = useMemo(
    () => ({
      view: "scores-numeric",
      dimensions: [],
      metrics: scoreOutlierStripQueryMetrics(),
      filters: numericFilters,
      timeDimension: { granularity: granularity.granularity },
      fromTimestamp: fromTimestamp.toISOString(),
      toTimestamp: toTimestamp.toISOString(),
      // Must stay null: an orderBy disables the WITH FILL densification.
      orderBy: null,
    }),
    [numericFilters, granularity.granularity, fromTimestamp, toTimestamp],
  );

  const stringQuery: QueryType = useMemo(
    () => ({
      view: "scores-categorical",
      dimensions: [],
      // String scores can be counted but do not have numeric value aggregates.
      metrics: [{ measure: "count", aggregation: "count" }],
      filters: stringFilters,
      timeDimension: { granularity: granularity.granularity },
      fromTimestamp: fromTimestamp.toISOString(),
      toTimestamp: toTimestamp.toISOString(),
      orderBy: null,
    }),
    [stringFilters, granularity.granularity, fromTimestamp, toTimestamp],
  );

  const numericQueryResult = api.dashboard.executeQuery.useQuery(
    { projectId, query: numericQuery, version: "v2" },
    {
      enabled: validRange && width > 0 && canApplyFilters,
      // Keep the previous bins ONLY across same-grid refetches — a
      // persistent band must not flash to a skeleton every interval; a grid
      // change (drill-in, Back, preset hop) shows the skeleton instead.
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

  const stringQueryResult = api.dashboard.executeQuery.useQuery(
    { projectId, query: stringQuery, version: "v2" },
    {
      enabled: validRange && width > 0 && canApplyFilters && queryStringScores,
      meta: { silentHttpCodes: [422] },
      trpc: { context: { skipBatch: true } },
    },
  );

  const bins = useMemo(
    () =>
      numericQueryResult.data && (!queryStringScores || stringQueryResult.data)
        ? rowsToScoreOutlierBins(
            mergeScoreOutlierRows(
              numericQueryResult.data as ScoreOutlierQueryRow[],
              queryStringScores
                ? (stringQueryResult.data as ScoreOutlierQueryRow[])
                : [],
            ),
          )
        : [],
    [numericQueryResult.data, queryStringScores, stringQueryResult.data],
  );

  const aggregation: ScoreOutlierAggKey =
    mode === "count" ? "count" : settings.valueAgg;

  const series = useMemo(
    () =>
      prepareScoreOutlierSeries({
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

  // Analytics props are metadata only (enums, counts, the granularity step)
  // — never bucket values or range contents.
  const handleSelectBucket = (
    range: { fromMs: number; toMs: number },
    meta: { trigger: ScoreOutlierStripDrillTrigger },
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
      surface: "scores",
    });
    onSelectRange({ from: new Date(range.fromMs), to: new Date(range.toMs) });
  };

  const handleModeChange = (next: StripMode) => {
    if (next === mode) return;
    capture("pulse:mode_switch", {
      mode: next,
      previousMode: mode,
      surface: "scores",
    });
    update({ mode: next });
  };

  const setAggregation = (agg: ScoreOutlierAggKey) => {
    if (agg === aggregation) return;
    capture("pulse:aggregation_switch", {
      metric: mode,
      aggregation: agg,
      previousAggregation: aggregation,
      surface: "scores",
    });
    update({ valueAgg: agg as "avg" | "min" | "max" });
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
  const placeholderMissesGrid =
    numericQueryResult.isPlaceholderData &&
    series.maxValue === 0 &&
    series.dense.every((bin) => bin.count === 0);
  const isLoading =
    validRange &&
    width > 0 &&
    ((numericQueryResult.isPending && !numericQueryResult.isError) ||
      (queryStringScores &&
        stringQueryResult.isPending &&
        !stringQueryResult.isError) ||
      placeholderMissesGrid);

  return (
    // Ruled top and bottom: the strip reads as its own band instead of
    // floating between the toolbar and the table header.
    <div ref={wrapperRef} className="shrink-0 border-y">
      {size === undefined ? null : (
        <div className="relative px-2 pt-2.5 pb-1">
          {!canApplyFilters ? (
            <div>
              <ScoreOutlierStripHeader
                mode={mode}
                onModeChange={handleModeChange}
                aggregation={aggregation}
                aggOptions={aggOptions}
                onAggregationChange={setAggregation}
              />
              <ScoreOutlierBarStrip
                className="mt-1.5"
                dense={[]}
                maxValue={0}
                ticks={[]}
                stepMs={stepMs}
                metric={mode}
                widthPx={chartWidth}
                disabledReason="Chart unavailable for the current filters"
              />
            </div>
          ) : isLoading || width === 0 ? (
            <div className="bg-muted h-[76px] animate-pulse rounded" />
          ) : numericQueryResult.isError ||
            (queryStringScores && stringQueryResult.isError) ? (
            <div className="text-muted-foreground flex h-[76px] items-center justify-center text-[11px]">
              No Data
            </div>
          ) : (
            <div
              className={cn(
                "min-w-0 transition-opacity",
                numericQueryResult.isPlaceholderData &&
                  numericQueryResult.isFetching &&
                  "opacity-60",
              )}
            >
              <ScoreOutlierStripHeader
                mode={mode}
                onModeChange={handleModeChange}
                aggregation={aggregation}
                aggOptions={aggOptions}
                onAggregationChange={setAggregation}
              />
              <ScoreOutlierBarStrip
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
                    surface: "scores",
                  })
                }
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
