/**
 * TraceLanesView — experimental "lanes" visualization (flag: laneTimelineView).
 *
 * One horizontal lane per observation type present in the trace; every
 * observation renders as a bar in its type's lane. Idle stretches where NO
 * observation is running are compressed into fixed-width hatched columns
 * (unlabeled — the point is "time passed here", not how much), so traces with
 * long waits stay readable.
 *
 * Deliberately not virtualized: the row count equals the number of observation
 * types (≤ ~10).
 */

import { useCallback, useMemo, useState } from "react";
import { cn } from "@/src/utils/tailwind";
import { ItemIcon, type LangfuseItemType } from "@/src/components/ItemBadge";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { formatDurationMs } from "@/src/features/traces/fns/timeline/layout";
import { usdFormatter, numberFormatter } from "@/src/utils/numbers";
import { Layer } from "@/src/components/ui/layer";
import {
  tooltipPlacement,
  tooltipStyle,
} from "@/src/features/traces/fns/timeline/tooltipPlacement";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { useSelection } from "@/src/features/traces/contexts/SelectionContext";
import { useSelectTraceNode } from "@/src/features/traces/hooks/useSelectTraceNode";
import {
  OBSERVATION_TYPE_COLOR,
  OBSERVATION_TYPE_FALLBACK_COLOR,
} from "@/src/features/traces/fns/observationTypeColors";

// Lane ordering: generation-ish work first, plumbing last.
const LANE_ORDER = [
  "AGENT",
  "GENERATION",
  "TOOL",
  "RETRIEVER",
  "EMBEDDING",
  "GUARDRAIL",
  "CHAIN",
  "EVENT",
  "SPAN",
];

// An idle stretch must be both absolutely and relatively long before it is
// compressed — short pauses stay proportional so the axis is not littered
// with hatches.
const IDLE_MIN_MS = 2_000;
const IDLE_MIN_FRACTION = 0.05;
/** Rendered width of a compressed idle column. */
const IDLE_PX = 24;
const LANE_HEIGHT_PX = 22;
/** Height of the tick-label axis row above the lanes (matches the timeline). */
const AXIS_HEIGHT_PX = 16;
const GUTTER_PX = 88;
/** Bars narrower than this carry no inline label (tooltip still names them). */
const LABEL_MIN_PX = 56;
const BAR_MIN_PX = 3;

type LaneBar = {
  id: string;
  name: string;
  type: string;
  startMs: number;
  endMs: number;
  costText: string | null;
  usageText: string | null;
};

type IdleGap = { startMs: number; endMs: number };

/** Merge [start,end] intervals and return the gaps between the merged runs. */
function findIdleGaps(intervals: Array<[number, number]>): IdleGap[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const gaps: IdleGap[] = [];
  let runEnd = sorted[0][1];
  for (const [start, end] of sorted.slice(1)) {
    if (start > runEnd) gaps.push({ startMs: runEnd, endMs: start });
    runEnd = Math.max(runEnd, end);
  }
  return gaps;
}

export function TraceLanesView() {
  const { observations, traceStartTime, traceDuration } = useTraceData();
  const { selectedNodeId } = useSelection();
  const selectNode = useSelectTraceNode("lanes");

  const [width, setWidth] = useState(0);
  const measureRef = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  const { lanes, idleGaps, toX, ticks } = useMemo(() => {
    const originMs = traceStartTime.getTime();
    const totalMs = Math.max(traceDuration * 1000, 1);
    const laneWidthPx = Math.max(width - GUTTER_PX, 100);

    const byType = new Map<string, LaneBar[]>();
    const intervals: Array<[number, number]> = [];
    // Idle detection uses LEAF observations only: a wrapper span (root, agent
    // loop) covers its whole subtree including the waits inside it, so counting
    // it as "busy" would mask every idle gap it contains.
    const parentIds = new Set(
      observations
        .map((obs) => obs.parentObservationId)
        .filter((id): id is string => Boolean(id)),
    );
    for (const obs of observations) {
      if (!obs.startTime) continue;
      const startMs = obs.startTime.getTime() - originMs;
      const endMs = obs.endTime
        ? obs.endTime.getTime() - originMs
        : obs.latency
          ? startMs + obs.latency * 1000
          : startMs;
      if (!parentIds.has(obs.id)) {
        intervals.push([startMs, Math.max(endMs, startMs)]);
      }
      const bars = byType.get(obs.type) ?? [];
      bars.push({
        id: obs.id,
        name: obs.name ?? obs.type.toLowerCase(),
        type: obs.type,
        startMs,
        endMs: Math.max(endMs, startMs),
        costText: obs.totalCost ? usdFormatter(obs.totalCost) : null,
        usageText:
          obs.totalUsage > 0 ? `∑ ${numberFormatter(obs.totalUsage, 0)}` : null,
      });
      byType.set(obs.type, bars);
    }

    const idleGaps = findIdleGaps(intervals).filter(
      (gap) =>
        gap.endMs - gap.startMs >= IDLE_MIN_MS &&
        gap.endMs - gap.startMs >= totalMs * IDLE_MIN_FRACTION,
    );

    const idleMsTotal = idleGaps.reduce(
      (sum, gap) => sum + (gap.endMs - gap.startMs),
      0,
    );
    const busyMsTotal = Math.max(totalMs - idleMsTotal, 1);
    const busyWidthPx = Math.max(
      laneWidthPx - idleGaps.length * IDLE_PX,
      idleGaps.length > 0 ? 100 : laneWidthPx,
    );
    const pxPerBusyMs = busyWidthPx / busyMsTotal;

    // Piecewise time → x: busy time scales linearly; each idle gap collapses
    // to a fixed-width column.
    const toX = (ms: number): number => {
      let x = 0;
      let cursor = 0;
      for (const gap of idleGaps) {
        if (ms <= gap.startMs) break;
        x += (gap.startMs - cursor) * pxPerBusyMs;
        if (ms < gap.endMs) {
          const fraction = (ms - gap.startMs) / (gap.endMs - gap.startMs);
          return x + fraction * IDLE_PX;
        }
        x += IDLE_PX;
        cursor = gap.endMs;
      }
      return x + (ms - cursor) * pxPerBusyMs;
    };

    const lanes = LANE_ORDER.filter((type) => byType.has(type))
      .concat([...byType.keys()].filter((type) => !LANE_ORDER.includes(type)))
      .map((type) => ({ type, bars: byType.get(type)! }));

    // Axis ticks at a "nice" time step (1/2/5 × 10^n) targeting ~6 labels.
    // Ticks are placed in real time and mapped through toX, so they stay
    // truthful across compressed idle columns.
    const roughStep = totalMs / 6;
    const magnitude = 10 ** Math.floor(Math.log10(Math.max(roughStep, 1)));
    const step =
      [1, 2, 5, 10]
        .map((m) => m * magnitude)
        .find((candidate) => candidate >= roughStep) ?? magnitude * 10;
    const ticks: Array<{ ms: number; x: number }> = [];
    for (let ms = 0; ms <= totalMs; ms += step) {
      ticks.push({ ms, x: toX(ms) });
    }

    return { lanes, idleGaps, toX, ticks };
  }, [observations, traceStartTime, traceDuration, width]);

  if (lanes.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        No observations to lay out.
      </div>
    );
  }

  return (
    <div ref={measureRef} className="w-full overflow-x-auto select-none">
      <LaneRows
        lanes={lanes}
        idleGaps={idleGaps}
        toX={toX}
        ticks={ticks}
        selectedNodeId={selectedNodeId}
        onSelect={selectNode}
      />
    </div>
  );
}

// Bars carry no inline labels (the tree below and the hover tooltip name
// them); lanes stay as short as they can without shrinking icon or text size.
const LANE_STYLE = {
  laneHeightPx: LANE_HEIGHT_PX,
  gutterPx: GUTTER_PX,
  barInsetPx: 3,
  showBarLabels: false,
  showSeparators: true,
  showLaneNames: true,
};

function LaneRows({
  lanes,
  idleGaps,
  toX,
  ticks,
  selectedNodeId,
  onSelect,
}: {
  lanes: Array<{ type: string; bars: LaneBar[] }>;
  idleGaps: IdleGap[];
  toX: (ms: number) => number;
  ticks: Array<{ ms: number; x: number }>;
  selectedNodeId: string | null;
  onSelect: (id: string) => void;
}) {
  const v = LANE_STYLE;
  // Hover tooltip, same pattern as the timeline: anchored to the pointer,
  // rendered in the tooltip layer so nothing clips it.
  const [hovered, setHovered] = useState<{
    bar: LaneBar;
    clientX: number;
    clientY: number;
  } | null>(null);

  return (
    <div
      className="relative"
      style={{ height: `${AXIS_HEIGHT_PX + lanes.length * v.laneHeightPx}px` }}
    >
      {/* Time axis — same structure and styling as the timeline view's axis
          (16px row, contrast tick borders, 9px labels to the right of each
          tick), plus faint gridlines continuing down through the lanes. */}
      <div
        className="border-border absolute inset-x-0 top-0 border-b"
        style={{ height: `${AXIS_HEIGHT_PX}px` }}
      >
        <div
          className="absolute inset-y-0 overflow-hidden"
          style={{ left: `${v.gutterPx}px`, right: 0 }}
        >
          {ticks.map((tick) => (
            <div
              key={tick.ms}
              className="border-border-contrast absolute inset-y-0 border-l"
              style={{ left: `${tick.x}px` }}
            >
              <span
                className="text-muted-foreground absolute left-1 whitespace-nowrap"
                style={{ fontSize: "9px" }}
              >
                {formatDurationMs(tick.ms)}
              </span>
            </div>
          ))}
        </div>
      </div>
      {ticks.map((tick) => (
        <div
          key={`grid-${tick.ms}`}
          className="border-border/50 absolute bottom-0 border-l"
          style={{
            left: `${v.gutterPx + tick.x}px`,
            top: `${AXIS_HEIGHT_PX}px`,
          }}
        />
      ))}

      {/* Idle columns span all lanes as hatched backdrops. */}
      {idleGaps.map((gap) => (
        <div
          key={gap.startMs}
          title={`Idle · ${formatIntervalSeconds((gap.endMs - gap.startMs) / 1000)}`}
          className="absolute bottom-0 opacity-60"
          style={{
            top: `${AXIS_HEIGHT_PX}px`,
            left: `${v.gutterPx + toX(gap.startMs)}px`,
            width: `${IDLE_PX}px`,
            backgroundImage:
              "repeating-linear-gradient(135deg, transparent, transparent 3px, var(--border) 3px, var(--border) 4px)",
          }}
        />
      ))}

      {lanes.map(({ type, bars }, laneIndex) => (
        <div
          key={type}
          className={cn(v.showSeparators && "border-border/50 border-b")}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${AXIS_HEIGHT_PX + laneIndex * v.laneHeightPx}px`,
            height: `${v.laneHeightPx}px`,
          }}
        >
          {/* Lane label gutter */}
          <div
            className="text-muted-foreground absolute inset-y-0 left-0 flex items-center gap-1.5 pl-3.5 text-xs"
            style={{ width: `${v.gutterPx}px` }}
          >
            <ItemIcon type={type as LangfuseItemType} className="size-3" />
            {v.showLaneNames && (
              <span className="truncate lowercase" title={type.toLowerCase()}>
                {type.toLowerCase()}
              </span>
            )}
          </div>

          {bars.map((bar) => {
            const left = v.gutterPx + toX(bar.startMs);
            const barWidth = Math.max(
              toX(bar.endMs) - toX(bar.startMs),
              BAR_MIN_PX,
            );
            const isSelected = bar.id === selectedNodeId;
            return (
              <button
                key={bar.id}
                type="button"
                onClick={() => onSelect(bar.id)}
                onPointerMove={(event) =>
                  setHovered({
                    bar,
                    clientX: event.clientX,
                    clientY: event.clientY,
                  })
                }
                onPointerLeave={() => setHovered(null)}
                className={cn(
                  // ring-background: a 1px page-colored seam so back-to-back
                  // calls in one lane read as separate bars, not one block.
                  "ring-background absolute cursor-pointer overflow-hidden rounded-[2px] text-left text-[11px] leading-tight whitespace-nowrap text-white/95 ring-1",
                  v.showBarLabels && "px-1",
                  OBSERVATION_TYPE_COLOR[type] ??
                    OBSERVATION_TYPE_FALLBACK_COLOR,
                  // Selection: accent ring (the selection color of the tree
                  // and timeline rows), offset so it reads on any bar color;
                  // z-bump keeps the ring above later-painted neighbors.
                  isSelected &&
                    "ring-primary-accent ring-offset-background z-[1] ring-2 ring-offset-1",
                )}
                style={{
                  left: `${left}px`,
                  width: `${barWidth}px`,
                  top: `${v.barInsetPx}px`,
                  bottom: `${v.barInsetPx}px`,
                }}
              >
                {v.showBarLabels && barWidth >= LABEL_MIN_PX ? bar.name : null}
              </button>
            );
          })}
        </div>
      ))}

      {hovered ? (
        <Layer name="tooltip">
          <div
            className="border-border bg-background text-foreground pointer-events-none fixed flex flex-col gap-0.5 rounded border px-1.5 py-1 text-xs shadow-md"
            style={tooltipStyle(
              tooltipPlacement({
                clientX: hovered.clientX,
                clientY: hovered.clientY,
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight,
              }),
            )}
          >
            <span className="flex items-center gap-1">
              <ItemIcon
                type={hovered.bar.type as LangfuseItemType}
                className="size-3 shrink-0"
              />
              <span className="max-w-64 truncate" title={hovered.bar.name}>
                {hovered.bar.name}
              </span>
            </span>
            <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span>
                {formatIntervalSeconds(
                  (hovered.bar.endMs - hovered.bar.startMs) / 1000,
                )}
              </span>
              {hovered.bar.costText ? (
                <span>{hovered.bar.costText}</span>
              ) : null}
              {hovered.bar.usageText ? (
                <span>{hovered.bar.usageText}</span>
              ) : null}
            </span>
          </div>
        </Layer>
      ) : null}
    </div>
  );
}
