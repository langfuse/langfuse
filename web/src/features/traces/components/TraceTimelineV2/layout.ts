/**
 * `layout()` — the one pure function that owns every timeline coordinate.
 *
 *   layout(tree, view, box, density) → PositionedNode[]
 *
 * Three properties it is built to hold, because the current renderer holds
 * none of them:
 *
 * 1. **`box` is required.** No default parameter, no fallback constant. A
 *    missing box is a type error, not a silently-900px canvas.
 * 2. **Total.** Zero-duration traces, instantaneous spans and missing
 *    `endTime`s produce finite coordinates, never `NaN`/`Infinity` — the
 *    degenerate window yields `pxPerMs === 0` instead of a division by zero.
 * 3. **Everything inside the box.** Bars, labels, ticks and gap markers are
 *    clamped into `[0, box.width]`, so no coordinate ever asks the container
 *    for horizontal scroll. Off-view spans are reported as `offscreen`; the
 *    way to reach them is to zoom or pan the view, never to scroll a canvas.
 *
 * Split for the per-frame path: `prepareTimeline` (tree walk — memoize on the
 * tree + collapsed set) and `timeCompressionFor` (memoize on the box width)
 * both stay out of the zoom/pan loop, which then only positions the rows the
 * virtualizer has mounted (`rowRange`).
 */

import type { Density } from "./density";
import type { TextMeasurer } from "./textMeasurer";
import {
  buildTimeCompression,
  identityCompression,
  type TimeCompression,
} from "./timeCompression";
import {
  clampView,
  createViewTransform,
  fitView,
  traceSpaceOf,
  type Box,
  type TimeSpan,
} from "./viewTransform";

/**
 * Structural input shape. `TreeNode` satisfies it, so Phase 2 can call
 * `layout()` on the real tree without an adapter.
 */
export type LayoutNode = {
  id: string;
  name: string;
  type?: string;
  startTime: Date;
  endTime?: Date | null;
  /** seconds — the only duration a synthetic root span has */
  latency?: number;
  completionStartTime?: Date | null;
  children: LayoutNode[];
};

export type TimelineRow = {
  node: LayoutNode;
  depth: number;
  treeLines: boolean[];
  isLastSibling: boolean;
  hasChildren: boolean;
  isCollapsed: boolean;
};

export type LabelPlacement = "inside" | "after" | "before" | "hidden";

export type PositionedNode = {
  id: string;
  name: string;
  type: string;
  index: number;
  depth: number;
  treeLines: boolean[];
  isLastSibling: boolean;
  hasChildren: boolean;
  isCollapsed: boolean;
  y: number;
  height: number;
  /** px from the lane's left edge — always within `[0, box.width]` */
  x: number;
  width: number;
  /** the span continues past this edge of the lane (zoomed in or panned) */
  clippedLeft: boolean;
  clippedRight: boolean;
  /** the span does not intersect the view at all */
  offscreen: boolean;
  /** real span duration; null when the span has no end and no latency */
  durationMs: number | null;
  /** time-to-first-token marker, null when absent or out of view */
  firstTokenX: number | null;
  label: string;
  labelWidth: number;
  labelPlacement: LabelPlacement;
  labelX: number;
  /** real ms offsets from the trace origin — what zoom-to-span needs */
  startMs: number;
  endMs: number;
};

export type Tick = { realMs: number; x: number; label: string };

export type GapMarker = {
  x: number;
  width: number;
  durationMs: number;
  label: string;
};

export type PreparedTimeline = {
  rows: TimelineRow[];
  originMs: number;
  durationMs: number;
  /** ms offsets of every non-root span — the compression input */
  spans: Array<[number, number]>;
};

export type TimelineLayout = {
  nodes: PositionedNode[];
  rowCount: number;
  rowHeight: number;
  contentHeight: number;
  /** compressed trace space — `[0, compressedDuration]` */
  traceSpace: TimeSpan;
  /** the visible window, clamped into trace space */
  view: TimeSpan;
  pxPerMs: number;
  realDurationMs: number;
  originMs: number;
  ticks: Tick[];
  gaps: GapMarker[];
  compression: TimeCompression;
};

export type LayoutInput = {
  roots: readonly LayoutNode[];
  /** measured — there is no fallback constant */
  box: Box;
  density: Density;
  measurer: TextMeasurer;
  /** null → fit the whole trace, which is the default view */
  view: TimeSpan | null;
  compress: boolean;
  collapsed?: ReadonlySet<string>;
  /** memoized tree walk; recomputed here when absent */
  prepared?: PreparedTimeline;
  /** memoized compression; recomputed here when absent */
  compression?: TimeCompression;
  /** position only these rows (the virtualizer's mounted window) */
  rowRange?: { startIndex: number; endIndex: number };
};

const EPSILON = 0.5;
const MAX_TICKS = 64;
const MIN_TICK_GAP_PX = 56;
const TICK_LABEL_PADDING_PX = 16;

// Nice tick steps in ms. Above a minute they land on time-nice boundaries so
// hour-scale traces get clean labels instead of "1500s".
const TICK_STEPS_MS = [
  1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1_000, 2_000, 5_000, 10_000,
  15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000,
  3_600_000, 7_200_000, 10_800_000, 21_600_000, 43_200_000, 86_400_000,
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const startOf = (node: LayoutNode) => node.startTime.getTime();

/** End of a span, falling back to `latency` and then to an instant. */
const endOf = (node: LayoutNode) => {
  if (node.endTime) return node.endTime.getTime();
  if (node.latency != null && Number.isFinite(node.latency)) {
    return startOf(node) + node.latency * 1000;
  }
  return startOf(node);
};

const hasDuration = (node: LayoutNode) =>
  Boolean(node.endTime) ||
  (node.latency != null && Number.isFinite(node.latency));

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(2)}s`;
  const pad = (value: number) => String(value).padStart(2, "0");
  if (ms < 3_600_000) {
    return `${Math.floor(ms / 60_000)}m ${pad(Math.floor((ms % 60_000) / 1_000))}s`;
  }
  return `${Math.floor(ms / 3_600_000)}h ${pad(Math.floor((ms % 3_600_000) / 60_000))}m`;
}

/**
 * Tree walk: flatten to rows, find the origin and the total duration, and
 * collect the spans compression may keep. Iterative — deep traces must not
 * blow the stack.
 */
export function prepareTimeline(
  roots: readonly LayoutNode[],
  collapsed: ReadonlySet<string> = new Set(),
): PreparedTimeline {
  if (roots.length === 0) {
    return { rows: [], originMs: 0, durationMs: 0, spans: [] };
  }

  let originMs = Infinity;
  let latestEndMs = -Infinity;
  const all: LayoutNode[] = [];
  const boundsStack: LayoutNode[] = [...roots];
  while (boundsStack.length > 0) {
    const node = boundsStack.pop()!;
    all.push(node);
    originMs = Math.min(originMs, startOf(node));
    latestEndMs = Math.max(latestEndMs, endOf(node));
    for (const child of node.children) boundsStack.push(child);
  }

  if (!Number.isFinite(originMs) || !Number.isFinite(latestEndMs)) {
    return { rows: [], originMs: 0, durationMs: 0, spans: [] };
  }
  const durationMs = Math.max(latestEndMs - originMs, 0);

  // Roots are excluded: a root covers the whole trace by definition, so keeping
  // it would mean no stretch of the trace is ever idle.
  const rootIds = new Set(roots.map((root) => root.id));
  const spans: Array<[number, number]> = [];
  for (const node of all) {
    if (rootIds.has(node.id)) continue;
    spans.push([startOf(node) - originMs, endOf(node) - originMs]);
  }

  const byStart = (a: LayoutNode, b: LayoutNode) => startOf(a) - startOf(b);
  const rows: TimelineRow[] = [];
  const stack: Array<Omit<TimelineRow, "hasChildren" | "isCollapsed">> = [];
  const sortedRoots = [...roots].sort(byStart);
  for (let i = sortedRoots.length - 1; i >= 0; i--) {
    stack.push({
      node: sortedRoots[i]!,
      depth: 0,
      treeLines: [],
      isLastSibling: i === sortedRoots.length - 1,
    });
  }

  while (stack.length > 0) {
    const current = stack.pop()!;
    const hasChildren = current.node.children.length > 0;
    const isCollapsed = collapsed.has(current.node.id);
    rows.push({ ...current, hasChildren, isCollapsed });

    if (!hasChildren || isCollapsed) continue;
    const children = [...current.node.children].sort(byStart);
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({
        node: children[i]!,
        depth: current.depth + 1,
        treeLines: [...current.treeLines, i !== children.length - 1],
        isLastSibling: i === children.length - 1,
      });
    }
  }

  return { rows, originMs, durationMs, spans };
}

/** Memoize on `[prepared, box.width, compress]` — not on the view. */
export function timeCompressionFor(
  prepared: PreparedTimeline,
  box: Box,
  compress: boolean,
): TimeCompression {
  return compress
    ? buildTimeCompression({
        spans: prepared.spans,
        durationMs: prepared.durationMs,
        physicalWidth: box.width,
        enabled: true,
      })
    : identityCompression(prepared.durationMs);
}

export function layout(input: LayoutInput): TimelineLayout {
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
  const from = Math.max(input.rowRange?.startIndex ?? 0, 0);
  const to = Math.min(
    input.rowRange?.endIndex ?? prepared.rows.length - 1,
    prepared.rows.length - 1,
  );

  const nodes: PositionedNode[] = [];
  for (let index = from; index <= to; index++) {
    const row = prepared.rows[index]!;
    nodes.push(
      positionRow(row, index, {
        originMs: prepared.originMs,
        compression,
        transform,
        laneWidth,
        rowHeight,
        density,
        measurer,
      }),
    );
  }

  return {
    nodes,
    rowCount: prepared.rows.length,
    rowHeight,
    contentHeight: prepared.rows.length * rowHeight,
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

function positionRow(
  row: TimelineRow,
  index: number,
  context: {
    originMs: number;
    compression: TimeCompression;
    transform: ReturnType<typeof createViewTransform>;
    laneWidth: number;
    rowHeight: number;
    density: Density;
    measurer: TextMeasurer;
  },
): PositionedNode {
  const {
    originMs,
    compression,
    transform,
    laneWidth,
    rowHeight,
    density,
    measurer,
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
  const x = clamp(clamp(left, 0, laneWidth), 0, Math.max(laneWidth - width, 0));

  const durationMs = hasDuration(node) ? endMs - startMs : null;
  const label = durationMs == null ? "" : formatDurationMs(durationMs);
  const labelWidth = label ? measurer.measure(label) : 0;
  const { labelPlacement, labelX } = placeLabel({
    label,
    labelWidth,
    x,
    width,
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
    width,
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
  const realDuration = realEnd - realStart;

  if (laneWidth <= 0) return [];
  if (!(realDuration > 0)) {
    return [{ realMs: realStart, x: 0, label: formatDurationMs(realStart) }];
  }

  const minGapPx = Math.max(
    MIN_TICK_GAP_PX,
    measurer.measure(formatDurationMs(realEnd)) + TICK_LABEL_PADDING_PX,
  );
  const step =
    TICK_STEPS_MS.find(
      (candidate) => (candidate / realDuration) * laneWidth >= minGapPx,
    ) ?? TICK_STEPS_MS[TICK_STEPS_MS.length - 1]!;

  const insideCollapsedGap = (realMs: number) =>
    compression.gaps.some((gap) => realMs > gap.start && realMs < gap.end);

  const ticks: Tick[] = [];
  let previousX = -Infinity;
  const first = Math.ceil(realStart / step) * step;
  for (let realMs = first; realMs <= realEnd; realMs += step) {
    if (ticks.length >= MAX_TICKS) break;
    if (insideCollapsedGap(realMs)) continue;
    const x = transform.toPx(compression.toCompressedMs(realMs));
    // Compression makes px spacing non-uniform, so labels are de-overlapped
    // here rather than assumed from the step. `toPx ∘ toCompressedMs` is
    // monotonic, so passing the right edge ends the walk.
    if (x > laneWidth + EPSILON) break;
    if (x < -EPSILON) continue;
    if (x - previousX < minGapPx) continue;
    previousX = x;
    ticks.push({ realMs, x, label: formatDurationMs(realMs) });
  }

  return ticks;
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
