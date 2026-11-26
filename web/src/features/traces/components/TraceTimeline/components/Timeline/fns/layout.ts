/**
 * `layout()` — the one pure function that owns every timeline coordinate.
 *
 * Three properties it is built to hold:
 *
 * 1. **`box` is required.** No default parameter, no fallback constant. A
 *    missing box is a type error, not a silently-900px canvas.
 * 2. **Total.** Zero-duration traces, instantaneous spans and missing
 *    `endTime`s produce finite coordinates, never `NaN`/`Infinity`.
 * 3. **Everything inside the box.** Bars, labels, ticks and gap markers are
 *    clamped into `[0, box.width]`.
 *
 * `prepareTimeline` and `timeCompressionFor` stay out of the zoom/pan loop,
 * which then only positions the rows the virtualizer has mounted.
 */

import type { Density } from "../../../types";
import type {
  GapMarker,
  LabelPlacement,
  LayoutInput,
  LayoutNode,
  PositionedNode,
  TextMeasurer,
  TimeCompression,
  Tick,
  TimeSpan,
  TimelineLayout,
  TimelineRow,
} from "../types";
import { clamp } from "./clamp";
import { clampView } from "./clampView";
import { createViewTransform } from "./createViewTransform";
import { endOf } from "./endOf";
import { fitView } from "./fitView";
import { formatDurationMs } from "./formatDurationMs";
import { prepareTimeline } from "./prepareTimeline";
import { spanOffsetsOf } from "./spanOffsetsOf";
import { startOf } from "./startOf";
import { timeCompressionFor } from "./timeCompressionFor";
import { traceSpaceOf } from "./traceSpaceOf";

const EPSILON = 0.5;
const MAX_TICKS = 64;
const MIN_TICK_GAP_PX = 56;
const TICK_LABEL_PADDING_PX = 16;
/** The tick line itself — a `border-l`, which the label is positioned inside of. */
const TICK_LINE_PX = 1;
/** The gap between that line and its label. */
const TICK_LABEL_GAP_PX = 4;
/**
 * What a label costs to the right of its tick's `x`: the line, then the gap.
 * Derived rather than written down, and exported, because the renderer positions
 * with the same two facts.
 *
 * There were three numbers for this one distance — 6 here, a `left-1` in the CSS
 * and a literal 4 in the label's own clamp — and every one of them was wrong: the
 * label sits inside the tick's 1px border, so its offset from `x` is 5. 6 dropped
 * a tick that would have rendered whole; 4 would have admitted one whose label
 * then gets truncated by its clamp. A reservation that does not match the render
 * is wrong even when it errs safely, because nothing says which way it errs next.
 */
const TICK_LABEL_INSET_PX = TICK_LINE_PX + TICK_LABEL_GAP_PX;

// Nice tick steps in ms. Above a minute they land on time-nice boundaries so
// hour-scale traces get clean labels instead of "1500s".
const TICK_STEPS_MS = [
  1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1_000, 2_000, 5_000, 10_000,
  15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000,
  3_600_000, 7_200_000, 10_800_000, 21_600_000, 43_200_000, 86_400_000,
];
const hasDuration = (node: LayoutNode) =>
  Boolean(node.endTime) ||
  (node.latency != null && Number.isFinite(node.latency));
export function layout<TNode extends LayoutNode>(
  input: LayoutInput<TNode>,
): TimelineLayout<TNode> {
  const { box, density, measurer } = input;
  const laneWidth = Math.max(Number.isFinite(box.width) ? box.width : 0, 0);

  const prepared =
    input.prepared ?? prepareTimeline(input.roots, input.collapsed);
  const compression =
    input.compression ?? timeCompressionFor(prepared, box, input.compress);

  const traceSpace = traceSpaceOf(compression.compressedDurationMs);
  const view = clampView(input.view ?? fitView(traceSpace), traceSpace);
  const transform = createViewTransform(view, { ...box, width: laneWidth });

  const rowHeight = density.rowHeight;
  const laneByRow = input.laneByRow;
  const laneCount = laneByRow
    ? laneByRow.reduce((max, lane) => Math.max(max, lane + 1), 0)
    : prepared.rows.length;
  const from = Math.max(input.rowRange?.startIndex ?? 0, 0);
  const to = Math.min(input.rowRange?.endIndex ?? laneCount - 1, laneCount - 1);

  const context = {
    originMs: prepared.originMs,
    compression,
    transform,
    laneWidth,
    rowHeight,
    density,
    measurer,
    formatLabel: input.formatLabel ?? formatDurationMs,
    barInsetPx: input.barInsetPx ?? 0,
  };
  const nodes: Array<PositionedNode<TNode>> = [];
  // Sub-pixel spans on one lane share a bar per pixel column. Dropping them
  // leaves a fitted session of short traces with nothing to zoom toward.
  const claimedColumn = new Set<string>();
  const lastIndex = laneByRow ? prepared.rows.length - 1 : to;
  const firstIndex = laneByRow ? 0 : from;
  for (let index = firstIndex; index <= lastIndex; index++) {
    const lane = laneByRow ? laneByRow[index] : index;
    if (lane == null || lane < from || lane > to) continue;
    const row = prepared.rows[index];
    if (!row) continue;
    if (laneByRow) {
      if (spanOutsideView(row.node, prepared.originMs, compression, view)) {
        continue;
      }
      // A span thinner than a pixel cannot be told apart at this zoom. One
      // bar per pixel column stands for the spans that land there, drawn at
      // the minimum width. The selected span claims that column, so a later
      // stand-in does not paint over it.
      const offsets = spanOffsetsOf(row.node, prepared.originMs);
      const compressedStart = compression.toCompressedMs(offsets.startMs);
      const compressedEnd = compression.toCompressedMs(
        Math.max(offsets.endMs, offsets.startMs),
      );
      const selected = row.node.id === input.selectedId;
      if (
        compressedEnd > compressedStart &&
        Math.abs(
          transform.toPx(compressedEnd) - transform.toPx(compressedStart),
        ) < 1
      ) {
        const column = Math.floor(transform.toPx(compressedStart));
        const key = `${lane}:${column}`;
        if (claimedColumn.has(key) && !selected) continue;
        claimedColumn.add(key);
      }
    }
    nodes.push(positionRow(row, lane, context));
  }

  return {
    nodes,
    rowCount: laneCount,
    rowHeight,
    contentHeight: laneCount * rowHeight,
    traceSpace,
    view,
    pxPerMs: transform.pxPerMs,
    realDurationMs: prepared.durationMs,
    originMs: prepared.originMs,
    ticks: buildTicks({ view, compression, transform, laneWidth, measurer }),
    gaps: buildGapMarkers({ compression, transform, laneWidth }),
    compression,
  };
}

function spanOutsideView(
  node: LayoutNode,
  originMs: number,
  compression: TimeCompression,
  view: TimeSpan,
): boolean {
  const offsets = spanOffsetsOf(node, originMs);
  const start = compression.toCompressedMs(offsets.startMs);
  const end = compression.toCompressedMs(
    Math.max(offsets.endMs, offsets.startMs),
  );
  const viewEnd = view.start + view.duration;
  return end < view.start || start > viewEnd;
}

function positionRow<TNode extends LayoutNode>(
  row: TimelineRow<TNode>,
  index: number,
  context: {
    originMs: number;
    compression: TimeCompression;
    transform: ReturnType<typeof createViewTransform>;
    laneWidth: number;
    rowHeight: number;
    density: Density;
    measurer: TextMeasurer;
    formatLabel: (durationMs: number) => string;
    barInsetPx: number;
  },
): PositionedNode<TNode> {
  const {
    originMs,
    compression,
    transform,
    laneWidth,
    rowHeight,
    density,
    measurer,
    formatLabel,
    barInsetPx,
  } = context;
  const node = row.node;

  const startMs = startOf(node) - originMs;
  const endMs = Math.max(endOf(node) - originMs, startMs);
  const left = transform.toPx(compression.toCompressedMs(startMs));
  const right = transform.toPx(compression.toCompressedMs(endMs));

  // Clamp into the lane, then keep the minimum-width marker inside it too:
  // a bar at the right edge shifts left rather than overflowing the box.
  const width = Math.min(
    Math.max(
      clamp(right, 0, laneWidth) - clamp(left, 0, laneWidth),
      density.minBarWidthPx,
    ),
    laneWidth,
  );
  let x = clamp(clamp(left, 0, laneWidth), 0, Math.max(laneWidth - width, 0));
  let drawnWidth = width;
  if (barInsetPx > 0 && drawnWidth > barInsetPx * 2 + 1) {
    x += barInsetPx;
    drawnWidth -= barInsetPx * 2;
  }

  const durationMs = hasDuration(node) ? endMs - startMs : null;
  const label = durationMs == null ? "" : formatLabel(durationMs);
  const labelWidth = label ? measurer.measure(label) : 0;
  const { labelPlacement, labelX } = placeLabel({
    label,
    labelWidth,
    x,
    width: drawnWidth,
    laneWidth,
    density,
  });

  const firstTokenMs = node.completionStartTime
    ? node.completionStartTime.getTime() - originMs
    : null;
  const firstTokenPx =
    firstTokenMs == null
      ? null
      : transform.toPx(compression.toCompressedMs(firstTokenMs));

  return {
    node,
    id: node.id,
    name: node.name,
    type: node.type ?? "SPAN",
    index,
    depth: row.depth,
    treeLines: row.treeLines,
    isLastSibling: row.isLastSibling,
    hasChildren: row.hasChildren,
    isCollapsed: row.isCollapsed,
    y: index * rowHeight,
    height: rowHeight,
    x,
    width: drawnWidth,
    clippedLeft: left < -EPSILON,
    clippedRight: right > laneWidth + EPSILON,
    offscreen: right < -EPSILON || left > laneWidth + EPSILON,
    durationMs,
    firstTokenX:
      firstTokenPx == null || firstTokenPx < 0 || firstTokenPx > laneWidth
        ? null
        : firstTokenPx,
    label,
    labelWidth,
    labelPlacement,
    labelX,
    startMs,
    endMs,
  };
}

/**
 * The decision CSS flow gets wrong in a narrow lane: inside the bar if it fits,
 * else outside on whichever side has room, else not drawn at all.
 */
function placeLabel(args: {
  label: string;
  labelWidth: number;
  x: number;
  width: number;
  laneWidth: number;
  density: Density;
}): { labelPlacement: LabelPlacement; labelX: number } {
  const { label, labelWidth, x, width, laneWidth, density } = args;
  if (!label) return { labelPlacement: "hidden", labelX: x };

  if (labelWidth + density.labelPaddingPx * 2 <= width) {
    return { labelPlacement: "inside", labelX: x + density.labelPaddingPx };
  }
  const after = x + width + density.labelGapPx;
  if (after + labelWidth <= laneWidth) {
    return { labelPlacement: "after", labelX: after };
  }
  const before = x - density.labelGapPx - labelWidth;
  if (before >= 0) return { labelPlacement: "before", labelX: before };

  return { labelPlacement: "hidden", labelX: x };
}

function buildTicks(context: {
  view: TimeSpan;
  compression: TimeCompression;
  transform: ReturnType<typeof createViewTransform>;
  laneWidth: number;
  measurer: TextMeasurer;
}): Tick[] {
  const { view, compression, transform, laneWidth, measurer } = context;
  const realStart = compression.toRealMs(view.start);
  const realEnd = compression.toRealMs(view.start + view.duration);

  if (laneWidth <= 0) return [];
  if (!(realEnd > realStart)) {
    return [{ realMs: realStart, x: 0, label: formatDurationMs(realStart) }];
  }

  const fits = (x: number, label: string) =>
    x >= -EPSILON &&
    x + TICK_LABEL_INSET_PX + measurer.measure(label) <= laneWidth;

  const ticks: Tick[] = [];
  const collides = (x: number, gapPx: number) =>
    ticks.some((tick) => Math.abs(tick.x - x) < gapPx);

  const place = (realMs: number, x: number, gapPx: number) => {
    if (ticks.length >= MAX_TICKS) return;
    const label = formatDurationMs(realMs);
    if (!fits(x, label) || collides(x, gapPx)) return;
    // The formatter rounds to a second, so a 500ms step prints the same words
    // twice. Keep the first of a run.
    if (
      ticks.some(
        (tick) => tick.label === label && Math.abs(tick.x - x) < gapPx * 2,
      )
    ) {
      return;
    }
    ticks.push({ realMs, x, label });
  };

  // Each visible stretch of real time between collapsed gaps gets its own
  // step. A gap that sits entirely outside the window must not change the
  // real time the window starts at, or the step is chosen for a duration the
  // pixels are not showing.
  const viewEnd = view.start + view.duration;
  const gaps = compression.gaps.toSorted(
    (a, b) => a.compressedStart - b.compressedStart,
  );
  const segments: Array<{
    compStart: number;
    compEnd: number;
    realStart: number;
    realEnd: number;
  }> = [];
  let compCursor = view.start;
  let realCursor = realStart;
  for (const gap of gaps) {
    if (gap.compressedEnd <= view.start) continue;
    if (gap.compressedStart >= viewEnd) break;
    const segmentEnd = Math.min(gap.compressedStart, viewEnd);
    if (segmentEnd > compCursor) {
      segments.push({
        compStart: compCursor,
        compEnd: segmentEnd,
        realStart: realCursor,
        realEnd: compression.toRealMs(segmentEnd),
      });
    }
    compCursor = Math.min(Math.max(compCursor, gap.compressedEnd), viewEnd);
    realCursor = compression.toRealMs(compCursor);
  }
  if (viewEnd > compCursor) {
    segments.push({
      compStart: compCursor,
      compEnd: viewEnd,
      realStart: realCursor,
      realEnd,
    });
  }

  // Edges of a collapsed gap go in first. A nearby round step must not take
  // their place: the labels on the break are what make the jump readable.
  for (const gap of gaps) {
    const edgeGap = Math.max(
      MIN_TICK_GAP_PX,
      measurer.measure(formatDurationMs(gap.end)) + TICK_LABEL_PADDING_PX,
    );
    place(gap.start, transform.toPx(gap.compressedStart), edgeGap);
    place(gap.end, transform.toPx(gap.compressedEnd), edgeGap);
  }

  for (const segment of segments) {
    const left = transform.toPx(segment.compStart);
    const right = transform.toPx(segment.compEnd);
    const width = right - left;
    const duration = segment.realEnd - segment.realStart;
    if (!(width > 0) || !(duration > 0)) continue;
    const gapPx = Math.max(
      MIN_TICK_GAP_PX,
      measurer.measure(formatDurationMs(segment.realEnd)) +
        TICK_LABEL_PADDING_PX,
    );
    const step =
      TICK_STEPS_MS.find(
        (candidate) => (candidate / duration) * width >= gapPx,
      ) ?? TICK_STEPS_MS[TICK_STEPS_MS.length - 1]!;
    const first = Math.ceil(segment.realStart / step) * step;
    for (let realMs = first; realMs <= segment.realEnd; realMs += step) {
      if (ticks.length >= MAX_TICKS) break;
      const x = transform.toPx(compression.toCompressedMs(realMs));
      if (x > laneWidth + EPSILON) break;
      place(realMs, x, gapPx);
    }
  }

  return ticks.sort((a, b) => a.x - b.x);
}

function buildGapMarkers(context: {
  compression: TimeCompression;
  transform: ReturnType<typeof createViewTransform>;
  laneWidth: number;
}): GapMarker[] {
  const { compression, transform, laneWidth } = context;
  if (!compression.enabled) return [];

  const markers: GapMarker[] = [];
  for (const gap of compression.gaps) {
    const left = transform.toPx(gap.compressedStart);
    const right = transform.toPx(gap.compressedEnd);
    if (right < 0 || left > laneWidth) continue;
    const x = clamp(left, 0, laneWidth);
    markers.push({
      x,
      width: clamp(right, 0, laneWidth) - x,
      durationMs: gap.durationMs,
      label: formatDurationMs(gap.durationMs),
    });
  }
  return markers;
}
