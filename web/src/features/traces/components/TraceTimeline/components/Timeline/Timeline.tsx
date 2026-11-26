/**
 * The Timeline. `TraceTimeline` measures a box and renders this inside it,
 * and the trace panel's Timeline view IS this — for everyone, on every device,
 * with no flag in front of it. A bug here is a bug in the product.
 *
 * The question it started as a spike to answer, and still answers: in a narrow,
 * tall layout, does killing the names and the text and spending every pixel on
 * shape make you FEEL the timeline — where a 26px row with a duration label next
 * to a 4px bar reads as a list of numbers instead?
 *
 * At rest: no name gutter, a 10px rail carrying type as a small square in the
 * type's own hue, rows shrunk to fit the box, and no text at all.
 *
 * Then it is driven **like a map**, because that is what exploring a dense
 * surface wants:
 *  - The left side follows one rule: if there is nothing to expand, it is not
 *    shown. At bird's-eye density it takes no width at all — a 4px row cannot
 *    hold a name, and a colour rail beside colour-coded bars is repetition. Once
 *    the rows can hold a name it simply appears, if there is width for it; on a
 *    phone or a peek panel, where there is not, the colour rail becomes the
 *    affordance and a hover or a tap floats the names over the chart.
 *  - Any wheel or two-finger scroll pans both axes; pinch and ⌘/ctrl + wheel zoom
 *    about the cursor. While rows are still too short to hold a label, that zoom
 *    grows only the rows — the whole duration stays on screen until the names
 *    come back — and after that both axes move together. Zoom is exponential in
 *    a zoom level and deltas accumulate per frame, as in mapping libraries — see
 *    the shared gesture adapter's rate constants.
 *  - Drag pans both axes too, and drag draws a box to zoom into — the one
 *    gesture where the user has stated the window on both axes, so it goes
 *    straight there. There are no scrollbars by design: a map has none, and the
 *    viewport clamps to the content so there is nowhere to get lost.
 *  - On a TOUCHSCREEN the same three gestures arrive as pointers rather than
 *    wheels: two fingers pinch to zoom both axes about their midpoint and pan by
 *    however far that midpoint travels, one finger pans, and a double-tap
 *    focuses — `dblclick` is not dependable from touch. `touch-action: none`
 *    stops the browser panning or zooming the page underneath, which also means
 *    nothing else will handle a pinch: it is this component's job or nobody's.
 *  - Double-click an element focuses it — the time window onto its own extent,
 *    the rows at a height a human reads, the element centred.
 *  - What a row shows follows from how tall it has become: the type square grows
 *    around 10px, text returns around 20px. Zooming in makes the timeline grow
 *    its labels back rather than switching mode.
 */

import {
  type CSSProperties,
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useTheme } from "next-themes";
import { usePanZoomGestures } from "@/src/hooks/usePanZoomGestures";
import { Scan, Minus, Plus, UnfoldVertical } from "@langfuse/icons";
import {
  ItemTypeIcon,
  type LangfuseItemType,
} from "@/src/components/ItemBadge";
import { tooltipPlacement } from "./fns/tooltipPlacement";
import { Layer } from "@/src/components/design-system/Layer/Layer";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import {
  TimelineRowMetrics,
  type RowMetrics,
} from "./components/TimelineRowMetrics";
import { cn } from "@/src/utils/tailwind";
import type { Density, PointerModality } from "../../types";
import type {
  Box,
  GapMarker,
  LayoutNode,
  PositionedNode,
  RowExtent,
  TooltipPlacement,
  Viewport,
} from "./types";
import { formatDurationMs } from "./fns/formatDurationMs";
import { layout } from "./fns/layout";
import { prepareTimeline } from "./fns/prepareTimeline";
import { spanOffsetsOf } from "./fns/spanOffsetsOf";
import { timeCompressionFor } from "./fns/timeCompressionFor";
import { packLanes } from "./fns/packLanes";
import { sessionIdleCompression } from "./fns/sessionIdleCompression";
import { IDLE_GAP_THRESHOLD_SECONDS } from "@/src/features/sessions/sessionIdleGap";
import { collapsedForSearch } from "./fns/collapsedForSearch";
import { createTextMeasurer } from "./fns/createTextMeasurer";
import { resolveBarTones } from "./fns/resolveBarTones";
import { traceSpaceOf } from "./fns/traceSpaceOf";
import { HUMAN_ROW_HEIGHT } from "./constants";
import { anchorTimeToRows } from "./fns/anchorTimeToRows";
import { canExpandRowsToReadable } from "./fns/canExpandRowsToReadable";
import { expandRowsToReadable } from "./fns/expandRowsToReadable";
import { interpolateViewport } from "./fns/interpolateViewport";
import { rowCountBounds } from "./fns/rowCountBounds";
import { viewportsEqual } from "./fns/viewportsEqual";
import { clampViewport } from "./fns/clampViewport";
import { fitViewport } from "./fns/fitViewport";
import { focusViewport } from "./fns/focusViewport";
import { isViewportFitted } from "./fns/isViewportFitted";
import { panViewport } from "./fns/panViewport";
import { presentationForRowHeight } from "./fns/presentationForRowHeight";
import { revealViewport } from "./fns/revealViewport";
import { rowHeightOf } from "./fns/rowHeightOf";
import { rowIndexAtOffset } from "./fns/rowIndexAtOffset";
import { visibleRowRange } from "./fns/visibleRowRange";
import { zoomToBox } from "./fns/zoomToBox";
import { zoomViewportRevealLabels } from "./fns/zoomViewportRevealLabels";

/** Reuses ItemBadge's type→hue mapping, so a colour means what it already means. */
const TYPE_COLOR: Record<string, string> = {
  TRACE: "bg-observation-trace",
  GENERATION: "bg-observation-generation",
  EVENT: "bg-observation-event",
  SPAN: "bg-observation-span",
  AGENT: "bg-observation-agent",
  EVALUATOR: "bg-observation-evaluator",
  TOOL: "bg-observation-tool",
  CHAIN: "bg-observation-chain",
  RETRIEVER: "bg-observation-retriever",
  EMBEDDING: "bg-observation-embedding",
  GUARDRAIL: "bg-observation-guardrail",
};
const FALLBACK_COLOR = "bg-muted-gray";
/** Neutral mode's bar, when colour is not carrying type. */
const NEUTRAL_COLOR = "bg-muted-foreground/60";
/**
 * Every colour a bar can be — the set whose contrast has to be resolved. The
 * accent used to be in here, and it was the one tone the picker read as dark
 * enough for a black label while looking mid-violet to a person.
 */
const BAR_COLORS = [
  ...Object.values(TYPE_COLOR),
  FALLBACK_COLOR,
  NEUTRAL_COLOR,
];

/**
 * `GENERATION` → `Generation`. The palette is by observation type, and the type
 * has to be readable wherever its colour is: nothing in the view said what the
 * colours meant, so the only way to learn was to ask someone.
 */
function typeLabel(type: string): string {
  return (type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()).replace(
    /_/g,
    " ",
  );
}

const RAIL_INDENT = 2;
const RAIL_MAX_DEPTH = 4;
/** Biggest the closed rail's type square gets, however tall the row is. */
const RAIL_SQUARE_MAX = 5;
/**
 * Wide enough for the deepest indent plus the square, computed rather than
 * guessed: at 10px the square of a depth-4 span was mostly outside the rail's
 * overflow-hidden box, so the one type indicator a closed rail has left was
 * clipped to a sliver exactly on the deeply-nested spans.
 */
const RAIL_WIDTH = RAIL_MAX_DEPTH * RAIL_INDENT + RAIL_SQUARE_MAX + 2;
/** Left inset of the open gutter, matching the tree rows' `pl-2`. */
const GUTTER_INSET = 8;
/** Indent per level once the gutter is open, matching the production gutter. */
const GUTTER_INDENT = 14;
/** Type icon size in the gutter, same as the tree rows. */
const GUTTER_ICON = 12;
/** A name needs at least this much to be worth indenting away from. */
const GUTTER_NAME_MIN = 48;
/**
 * Where a level's vertical rail sits: under the CENTRE of that level's icon, so
 * the spine reads as descending from the icon that owns it. Hugging the icon's
 * left edge instead left the elbow pointing at nothing in particular.
 */
const GUTTER_RAIL = GUTTER_INSET + GUTTER_ICON / 2;
/** Stable empty set, so an absent `collapsed` prop does not break a memo. */
const EMPTY_COLLAPSED: ReadonlySet<string> = new Set<string>();
/**
 * How far a row that missed the search drops. Low enough that the hits read as
 * the only thing lit, high enough that a miss is still a bar you can aim at —
 * the rows stay clickable and hoverable while a query is live.
 */
const SEARCH_DIM_OPACITY = "opacity-30";
const TOOLBAR_HEIGHT = 22;
const AXIS_HEIGHT = 16;
const READOUT_HEIGHT = 18;
const FRAME_BORDER = 1;
/** Step for the toolbar buttons and the keyboard, in zoom levels. */
const BUTTON_ZOOM_LEVELS = 0.6;
const DRAG_THRESHOLD_PX = 3;
const MAX_BAR_HEIGHT = 18;
/**
 * Below this a row cannot hold a name — and since a colour rail beside
 * colour-coded bars says nothing the bars have not already said, the whole left
 * side takes no width at all there. See `canShowNames` for the rule.
 */
const NAME_MIN_ROW_HEIGHT = 14;
/** The chart never shrinks below this to make room for names, even if asked. */
const MIN_LANE_WIDTH = 140;
/**
 * And it only VOLUNTEERS the gutter while the chart keeps this much. Two
 * thresholds, because "we opened it for you" and "you asked for it" deserve
 * different answers: on a phone, spending 136px of 360 on names by default
 * leaves the timeline too thin to read, so there the colour rail plus a tap is
 * the better trade.
 */
const AUTO_OPEN_MIN_LANE_WIDTH = 280;
/**
 * A focus flies rather than teleports. An instant jump reads as "the bar I
 * clicked got bigger" — you cannot see that the window moved, especially when
 * the rows around it were already full width. Maps animate their zoom for the
 * same reason.
 */
const FOCUS_ANIMATION_MS = 320;
/** Slack around the rail so the peek zone is reachable at rail width. */
const PEEK_MARGIN_PX = 6;

/** Same size the axis tick labels render at. The idle label uses it too. */
const TICK_FONT_PX = 9;
/** A collapsed-gap band narrower than this has no room to name itself. */
const GAP_LABEL_MIN_WIDTH = 14;

function idleAxisLabel(durationMs: number): string {
  const whole = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m idle`;
  if (hours > 0) return `${hours}h idle`;
  return `${minutes}m idle`;
}

type IdleAxisLabel = { label: string; left: number; width: number };

/** A 9px character is a little over half that wide. */
const AXIS_CHAR_PX = TICK_FONT_PX * 0.56;
/** Tick text starts 4px right of its line (`left-1`). */
const TICK_LABEL_INSET_PX = 4;

function axisTextWidth(text: string) {
  return text.length * AXIS_CHAR_PX;
}

function placedIdleLabels(gaps: readonly GapMarker[]): IdleAxisLabel[] {
  const placed: IdleAxisLabel[] = [];
  let labelCursor = 0;
  for (const gap of gaps) {
    if (gap.durationMs < IDLE_GAP_THRESHOLD_SECONDS * 1000) continue;
    const label = idleAxisLabel(gap.durationMs);
    if (gap.width < GAP_LABEL_MIN_WIDTH) continue;
    const width = axisTextWidth(label);
    if (width > gap.width) continue;
    const left = gap.x + (gap.width - width) / 2;
    if (left < labelCursor) continue;
    labelCursor = left + width;
    placed.push({ label, left, width });
  }
  return placed;
}

type TickSide = "right" | "left";
type AxisBox = { left: number; right: number };

function boxesOverlap(a: AxisBox, b: AxisBox) {
  return a.left < b.right && b.left < a.right;
}

function tickLabelBox(x: number, label: string, side: TickSide): AxisBox {
  const width = axisTextWidth(label);
  if (side === "left") {
    const right = x - TICK_LABEL_INSET_PX;
    return { left: right - width, right };
  }
  const left = x + TICK_LABEL_INSET_PX;
  return { left, right: left + width };
}

function placedTickSides<T extends { x: number; label: string }>(
  ticks: readonly T[],
  idle: readonly IdleAxisLabel[],
) {
  const idleBoxes = idle.map((item) => ({
    left: item.left,
    right: item.left + item.width,
  }));
  const taken: AxisBox[] = [];
  const sides: Array<TickSide | null> = ticks.map(() => null);
  const claim = (index: number, order: readonly TickSide[]) => {
    const tick = ticks[index];
    if (!tick) return;
    for (const side of order) {
      const box = tickLabelBox(tick.x, tick.label, side);
      const blocked =
        box.left < 0 ||
        idleBoxes.some((other) => boxesOverlap(box, other)) ||
        taken.some((other) => boxesOverlap(box, other));
      if (blocked) continue;
      taken.push(box);
      sides[index] = side;
      return;
    }
  };
  // The tick whose usual label runs into the idle words is the break marker.
  // It claims a side before the ticks to its left, which are ordinary steps.
  ticks.forEach((tick, index) => {
    const right = tickLabelBox(tick.x, tick.label, "right");
    const meetsIdle = idleBoxes.some((other) => boxesOverlap(right, other));
    if (meetsIdle) claim(index, ["left", "right"]);
  });
  ticks.forEach((_, index) => {
    if (sides[index] != null) return;
    claim(index, ["right", "left"]);
  });
  return ticks.map((tick, index) => ({ tick, side: sides[index] ?? null }));
}

function idleGapLabels(placed: readonly IdleAxisLabel[]) {
  return placed.map((idle) => (
    <span
      key={`idle-${idle.left}`}
      className="text-muted-foreground absolute whitespace-nowrap"
      style={{ left: `${idle.left}px`, top: 0, fontSize: `${TICK_FONT_PX}px` }}
      data-testid="timeline-idle-gap"
    >
      {idle.label}
    </span>
  ));
}

/** Below this in both axes a drag was a stray click, not a box. */
const MARQUEE_MIN_PX = 6;
/** Two taps within this long, and this close, are one double-tap. */
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_SLOP_PX = 24;

/** Anchor ratios are fractions of the box; a finger can leave it mid-gesture. */
const clampRatio = (value: number) =>
  Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0.5;

type MarqueeBox = {
  from: { x: number; y: number };
  to: { x: number; y: number };
};

export type TimelineProps = {
  roots: LayoutNode[];
  /** The measured box. Required — there is no fallback size. */
  box: Box;
  /**
   * Starting gutter mode. `auto` derives it from row height — a hairline row
   * cannot hold a name, a 26px row can — which is the default and the point of
   * this layout.
   */
  gutter: GutterMode;
  /**
   * Ids whose descendants are hidden — the SAME set the tree view collapses
   * with, so "collapse all" in the header means the same thing in both. The pure
   * core has always taken it; this view simply never passed it on, so the button
   * moved the store and nothing here moved.
   */
  collapsed?: ReadonlySet<string>;
  /**
   * Input modality. `fine` peeks the gutter on hover; `coarse` has no hover, so
   * it toggles on a tap of the rail.
   */
  pointer: PointerModality;
  /** Colour the bars by type too, or leave them neutral and let the rail carry it. */
  barColor: "neutral" | "type";
  compress: boolean;
  showReadout: boolean;
  /**
   * Selection is CONTROLLED: the trace panel's other views select the same
   * observation, so this must not keep its own copy. See SelectionContext.
   */
  selectedId: string | null;
  /** Absent for a read-only chart: rows keep hover and zoom, not the pointer. */
  onSelect?: (nodeId: string) => void;
  /** Hover, for prefetching the observation the user is about to open. */
  onHover?: (nodeId: string) => void;
  /**
   * Extra facts for the hover tooltip, already formatted — cost and token usage
   * live on the app's node, not on the layout contract, and their formatters
   * live with the app. At this density hover is how a row is read at all, so it
   * should say what a tree row says.
   */
  /**
   * What a row has to say about itself — cost, scores, comments, and the
   * heat-map classes for its metrics. Supplied rather than derived, so this
   * renderer keeps deciding only what FITS.
   */
  metricsOf?: (nodeId: string) => RowMetrics;
  /** The view-options duration toggle; the tree honours the same one. */
  showDuration?: boolean;
  /**
   * An active search, or absent when there is none. The chart answers a query
   * by staying a chart: matching bars keep their hue and their label, the rest
   * drop to `SEARCH_DIM_OPACITY` — dimming the misses rather than recolouring
   * the hits, because hue here means observation type and nothing else.
   *
   * Dimmed rows keep their click and hover targets: a bar you can still see is
   * a bar you can still open, and searching should not make the trace read-only.
   */
  search?: {
    /**
     * The raw query string. Identity for "reveal the first hit ONCE per query":
     * retyping what is already in the box must not re-pan the chart.
     */
    query: string;
    /**
     * Matching OBSERVATION ids. A hit inside a collapsed subtree has no bar, so
     * the chart opens the rows above it for as long as the query is live (see
     * `collapsedForSearch`) — which is why the caller hands over ids rather than
     * rows: it does not know what this view has collapsed.
     */
    matchedIds: ReadonlySet<string>;
    /** The quiet toolbar readout — "3 matches" / "No matches". Supplied, so the
     * count is the wiring layer's to define (it counts matching observations
     * over the whole trace, which is every bar this chart lights). */
    label: string;
  };
  /**
   * `tree` is one row per span (the default). `packed` packs non-overlapping
   * spans onto shared rows, stacked by nesting depth.
   */
  rowLayout?: "tree" | "packed";
  onRowLayoutChange?: (layout: "tree" | "packed") => void;
  /**
   * Collapse idle time between top-level traces that exceeds the session
   * sidebar threshold. On for the product timeline; stories can turn it off
   * to show the uncompressed clock.
   */
  collapseIdleGaps?: boolean;
};

export type GutterMode = "auto" | "expanded" | "collapsed";

/**
 * What a row's background says about it. ONE decision, because two places draw a
 * row — the chart and the names floating over it — and a second copy is a second
 * chance to miss a state.
 */
function rowWashClass(state: {
  selected: boolean;
  focused: boolean;
}): string | false {
  if (state.selected) return "bg-primary-accent/20";
  // At 4px a tint is not enough to find yourself by, so these are full-width.
  return state.focused && "bg-primary-accent/15";
}

export function Timeline({
  roots,
  box,
  gutter,
  collapsed,
  pointer,
  barColor,
  compress,
  showReadout,
  selectedId,
  onSelect,
  onHover,
  metricsOf,
  showDuration = true,
  search,
  rowLayout = "tree",
  onRowLayoutChange,
  collapseIdleGaps = true,
}: TimelineProps) {
  const [windowState, setWindowState] = useState<{
    layout: "tree" | "packed";
    viewport: Viewport | null;
  }>({ layout: rowLayout, viewport: null });
  // A layout switch changes how many rows exist. A window stored for the
  // other layout is ignored, so the next render fits the new row count.
  const rowLayoutRef = useRef(rowLayout);
  const setViewport = (next: Viewport | null) => {
    setWindowState({ layout: rowLayoutRef.current, viewport: next });
  };
  const tween = useRef(0);
  const tweenLayout = useRef(rowLayout);
  if (tweenLayout.current !== rowLayout) {
    tweenLayout.current = rowLayout;
    if (tween.current) cancelAnimationFrame(tween.current);
    tween.current = 0;
  }
  const [pointerPos, setPointerPos] = useState<{
    x: number;
    y: number;
    /** The same point in VIEWPORT coordinates, for the tooltip's own layer. */
    clientX: number;
    clientY: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  /**
   * Zoom box, in surface coordinates, while it is being drawn. The REF is
   * the authority and the state is only for drawing it: a gesture that read the
   * box back out of render scope would depend on React having re-rendered
   * between pointerdown and pointerup, which nothing guarantees.
   */
  const marqueeRef = useRef<MarqueeBox | null>(null);
  const [marquee, setMarquee] = useState<MarqueeBox | null>(null);
  const setMarqueeBox = (next: MarqueeBox | null) => {
    marqueeRef.current = next;
    setMarquee(next);
  };

  /**
   * The collapse state the rows are actually built with: the user's, plus the
   * paths to the search's hits opened, because a match with no row is a match
   * the count promises and the chart cannot show. Identical to `collapsed` when
   * there is no query or nothing is hidden.
   */
  const effectiveCollapsed = useMemo(
    () =>
      search
        ? collapsedForSearch({
            roots,
            collapsed: collapsed ?? EMPTY_COLLAPSED,
            matchedIds: search.matchedIds,
          })
        : collapsed,
    [search, roots, collapsed],
  );
  const prepared = useMemo(
    () => prepareTimeline(roots, effectiveCollapsed),
    [roots, effectiveCollapsed],
  );
  const lanePacking = useMemo(() => packLanes(prepared.rows), [prepared]);
  // Fewer than two rows saved still looks like one row per span, so the
  // switch stays off and the tree stays up. The stored choice is left alone.
  const packedSavesSpace = prepared.rows.length - lanePacking.laneCount >= 2;
  const packed = rowLayout === "packed" && packedSavesSpace;
  const packing = packed ? lanePacking : null;
  const shownLayout = packed ? "packed" : "tree";
  const viewport =
    windowState.layout === shownLayout ? windowState.viewport : null;
  rowLayoutRef.current = shownLayout;
  const rowCount = packing?.laneCount ?? prepared.rows.length;
  // Measured in the font the labels ACTUALLY render in, read off a probe span
  // that carries their own size — `10px ui-sans-serif` is a guess, and the
  // canvas resolves it to a different face than the app's system stack, ~6px
  // narrow on a duration. layout() decides which side a label goes on, and that
  // decision is only as good as the font it measured.
  const [labelFont, setLabelFont] = useState<string | null>(null);
  const labelProbeRef = useCallback((element: HTMLSpanElement | null) => {
    if (!element) return;
    const style = getComputedStyle(element);
    const font = `${style.fontSize} ${style.fontFamily}`;
    setLabelFont((previous) => (previous === font ? previous : font));
  }, []);
  const measurer = useMemo(
    () => createTextMeasurer(labelFont ?? "10px ui-sans-serif"),
    [labelFont],
  );
  // Resolved per theme, because three of these colours flip lightness between
  // themes. `resolvedTheme` is the trigger; the probe is the answer.
  const { resolvedTheme } = useTheme();
  const barTones = useMemo(
    () => resolveBarTones(BAR_COLORS, { theme: resolvedTheme }),
    [resolvedTheme],
  );

  // A manual override lives until you touch the chart again, which is what
  // "expand to look, then get out of my way" means in practice.
  const [override, setOverride] = useState<GutterMode | null>(null);
  // An explicit "Show labels" is the other ask: keep the names on screen even
  // when a gesture would have handed the gutter back, and even when auto would
  // rather keep the lane. Fit or a rail collapse lets go.
  const [labelsPinned, setLabelsPinned] = useState(false);
  // Desktop peek: hovering the left edge opens it, moving into the chart closes
  // it again. No click to look, no click to get out of the way.
  const [peeking, setPeeking] = useState(false);
  const gutterMode = override ?? gutter;
  const contentWidth = Math.max(box.width - FRAME_BORDER * 2, 0);
  const surfaceHeight = Math.max(
    box.height -
      FRAME_BORDER * 2 -
      TOOLBAR_HEIGHT -
      AXIS_HEIGHT -
      (showReadout ? READOUT_HEIGHT : 0),
    0,
  );
  // Lanes stay at a readable height instead of stretching across the panel.
  // The card itself still fills the box; the space under the last lane is
  // the same chart background.
  const chartHeight =
    packed && rowCount > 0
      ? Math.min(surfaceHeight, rowCount * HUMAN_ROW_HEIGHT)
      : surfaceHeight;
  const frameHeight = box.height;

  // Resolve the VERTICAL window first. It depends only on the row count and the
  // height, never on the width, so row height is known before the gutter width
  // — which is what breaks the cycle (gutter → lane → compression → viewport).
  // Deciding the gutter from the *resting* row height instead left it a rail
  // forever, however far you zoomed in.
  const rowBounds = rowCountBounds({
    rowCount,
    boxHeight: chartHeight,
  });
  const liveRowCount = Math.min(
    Math.max(viewport?.rows.count ?? rowBounds.max, rowBounds.min),
    rowBounds.max,
  );
  const liveRowHeight =
    liveRowCount > 0 ? chartHeight / liveRowCount : HUMAN_ROW_HEIGHT;

  // The left side is the key to the lines — the tree gutter, names and all. It
  // can only open when the rows are tall enough to hold a name: at 4px there is
  // no name to show, and the hover tooltip is what names a row at that density.
  /**
   * The left side follows one rule: **if there is nothing to expand, do not show
   * it.**
   *
   * At bird's-eye density a row cannot hold a name, so no amount of expanding
   * reveals anything — and the colour rail is pure repetition there, because the
   * bars already carry the type colour. So it takes no width at all and the whole
   * box is timeline.
   *
   * Once the rows CAN hold a name there are two cases. With width to spare, just
   * show the gutter — nothing is gained by making someone hover for something
   * that fits. Without it (a phone, a peek panel), keep the colour rail as the
   * affordance and let a hover or a tap float the names over the chart.
   */
  const canShowNames = liveRowHeight >= NAME_MIN_ROW_HEIGHT;
  const wantedGutter = Math.min(Math.max(contentWidth * 0.38, 96), 168);
  const asked =
    labelsPinned || override === "expanded" || gutterMode === "expanded";
  // An explicit "Show labels" pin wins over a leftover rail-collapse
  // override; otherwise the names stay a peek overlay and never take
  // the gutter the user just asked for.
  const wantsOpen = (() => {
    if (labelsPinned) {
      return true;
    }
    if (override === "collapsed") {
      return false;
    }
    // Packed rows share a lane. A name beside the row would name the lane,
    // not a span, so the left side takes no width at all.
    if (packed) return false;
    return asked || gutterMode === "auto";
  })();
  const gutterFits =
    contentWidth - wantedGutter >=
    (asked ? MIN_LANE_WIDTH : AUTO_OPEN_MIN_LANE_WIDTH);

  // A COMMITTED open takes real space and re-lays out the chart. A PEEK must
  // not: it floats over the timeline instead, so hovering the edge never shoves
  // the bars sideways while you are reading them.
  const committedOpen = !packed && canShowNames && gutterFits && wantsOpen;
  const railWidth = (() => {
    if (packed || !canShowNames) return 0;
    if (committedOpen) return wantedGutter;
    return RAIL_WIDTH;
  })();
  const laneWidth = Math.max(contentWidth - railWidth, 0);

  const chartBox = useMemo(
    () => ({ width: laneWidth, height: chartHeight }),
    [laneWidth, chartHeight],
  );
  const compression = useMemo(() => {
    if (collapseIdleGaps) {
      const idle = sessionIdleCompression({
        rows: prepared.rows,
        originMs: prepared.originMs,
        durationMs: prepared.durationMs,
        physicalWidth: chartBox.width,
        spans: prepared.spans,
      });
      if (idle) return idle;
    }
    return timeCompressionFor(prepared, chartBox, compress);
  }, [collapseIdleGaps, prepared, chartBox, compress]);

  // The collapsed band is a fixed number of pixels, so its compressed duration
  // changes when the lane width changes. The stored window is in that
  // compressed clock. Map it through real time so a resize keeps the same span.
  const compressionRef = useRef(compression);
  const activeViewport = useMemo(() => {
    if (!viewport || compressionRef.current === compression) return viewport;
    const previous = compressionRef.current;
    const realStart = previous.toRealMs(viewport.time.start);
    const realEnd = previous.toRealMs(
      viewport.time.start + viewport.time.duration,
    );
    const start = compression.toCompressedMs(realStart);
    const duration = Math.max(compression.toCompressedMs(realEnd) - start, 0);
    if (
      Math.abs(start - viewport.time.start) <= 0.05 &&
      Math.abs(duration - viewport.time.duration) <= 0.05
    ) {
      return viewport;
    }
    return { time: { start, duration }, rows: viewport.rows };
  }, [viewport, compression]);
  if (compressionRef.current !== compression) {
    compressionRef.current = compression;
    if (activeViewport && activeViewport !== viewport) {
      setWindowState({
        layout: rowLayoutRef.current,
        viewport: activeViewport,
      });
    }
  }

  const limits = useMemo(
    () => ({
      traceSpace: traceSpaceOf(compression.compressedDurationMs),
      rowCount,
      boxHeight: chartHeight,
    }),
    [compression.compressedDurationMs, rowCount, chartHeight],
  );

  // Re-clamped every render, so a resize can never leave the viewport looking
  // outside the content.
  const current = useMemo(
    () =>
      activeViewport
        ? clampViewport(activeViewport, limits)
        : fitViewport(limits),
    [activeViewport, limits],
  );
  const rowHeight = rowHeightOf(current, chartHeight);
  const isOpen = committedOpen;
  const namesVisible = isOpen;
  // The overlay is not bound by MIN_LANE_WIDTH: it costs the chart no width, so
  // an explicit ask still gets the names where they could not fit beside the
  // chart.
  const peekWidth =
    !packed &&
    canShowNames &&
    !committedOpen &&
    (peeking || labelsPinned || override === "expanded")
      ? wantedGutter
      : 0;
  const presentation = presentationForRowHeight(rowHeight);
  const fitted = isViewportFitted(current, limits);
  const canShowLabels = canExpandRowsToReadable(current, limits);
  const labelsShowing = committedOpen || (labelsPinned && peekWidth > 0);
  // Replace Fit only while the whole clock is still on screen AND names are
  // missing. Rows can be too short, or the pane too narrow to volunteer a
  // gutter — both are the same ask. A time-zoomed hairline keeps Fit.
  const clockFits = current.time.duration >= limits.traceSpace.duration - 0.5;
  const offerShowLabels =
    !packed && clockFits && !labelsShowing && (canShowLabels || canShowNames);
  const fitSpent = fitted && !labelsPinned;
  const barHeight = Math.max(Math.min(rowHeight - 1, MAX_BAR_HEIGHT), 1);

  /**
   * Which row the pointer is over — DERIVED from where the pointer is, never
   * stored. Storing it meant a gesture-scroll moved the rows under a pointer
   * that had not moved, and the tooltip went on naming the row that used to be
   * there. The pointer position is the only fact; the row under it follows from
   * that and the window, so it cannot go stale.
   */
  const focusIndex =
    pointerPos == null
      ? null
      : rowIndexAtOffset(current, pointerPos.y, rowHeight, rowCount);
  /** Last id we told the caller about, so a prefetch fires once per row. */
  const hoveredRef = useRef<string | null>(null);
  const pointerPosRef = useRef(pointerPos);
  pointerPosRef.current = pointerPos;

  const density: Density = useMemo(
    () => ({
      pointer,
      rowHeight,
      barHeight: Math.max(Math.min(rowHeight - 1, MAX_BAR_HEIGHT), 1),
      labelFontPx: 11,
      labelPaddingPx: 4,
      labelGapPx: 6,
      minBarWidthPx: presentation === "hairline" ? 2 : 4,
    }),
    [rowHeight, presentation, pointer],
  );

  const rowRange = visibleRowRange(current, rowCount);
  const result = layout({
    roots,
    box: chartBox,
    density,
    measurer,
    view: current.time,
    compress,
    prepared,
    compression,
    rowRange,
    laneByRow: packing?.lanes,
    barInsetPx: packed ? 2 : 0,
    selectedId,
  });
  const axisIdleLabels = placedIdleLabels(result.gaps);
  const axisTickLabels = placedTickSides(result.ticks, axisIdleLabels);

  // What each row occupies on the time axis, in the same compressed space the
  // window is expressed in — so a zoom can tell "nothing to see here" from "the
  // thing you were looking at is still here".
  const extentOf = useCallback(
    (rowIndex: number): RowExtent | readonly RowExtent[] | null => {
      if (packing) {
        const intervals: RowExtent[] = [];
        packing.lanes.forEach((lane, index) => {
          if (lane !== rowIndex) return;
          const row = prepared.rows[index];
          if (!row) return;
          const offsets = spanOffsetsOf(row.node, prepared.originMs);
          intervals.push({
            startMs: compression.toCompressedMs(offsets.startMs),
            endMs: compression.toCompressedMs(offsets.endMs),
          });
        });
        return intervals.length > 0 ? intervals : null;
      }
      const row = prepared.rows[rowIndex];
      if (!row) return null;
      const offsets = spanOffsetsOf(row.node, prepared.originMs);
      return {
        startMs: compression.toCompressedMs(offsets.startMs),
        endMs: compression.toCompressedMs(offsets.endMs),
      };
    },
    [prepared, compression, packing],
  );

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const gesture = useRef({
    down: false,
    dragging: false,
    x: 0,
    y: 0,
    /** What this press becomes once it moves: a zoom box, or a pan. */
    intent: "pan" as "pan" | "zoom",
    /** Where it began, in surface coordinates, for the box's own corner. */
    originX: 0,
    originY: 0,
  });
  /**
   * Every pointer currently down, and the pinch they describe.
   *
   * A touchscreen pinch is NOT a wheel event: it arrives as two pointers, and
   * `touch-action: none` (which this surface needs, so the browser does not pan
   * or zoom the page under the gesture) means nothing else handles it either. So
   * with one-pointer logic only, a two-finger pinch did nothing at all.
   */
  const touches = useRef({
    points: new Map<number, { x: number; y: number }>(),
    distance: 0,
    midpoint: { x: 0, y: 0 },
  });
  /**
   * Double-TAP focuses a row, because `dblclick` is not dependable from touch —
   * Safari in particular does not synthesise it. Detected here rather than
   * relied upon: two taps close in time and place, on the same row.
   */
  const lastTap = useRef({ at: 0, x: 0, y: 0 });
  /**
   * Set when a double-tap has just fired, so the tap's own click does not also
   * select. `event.detail` cannot carry this on touch: WebKit neither synthesises
   * `dblclick` from taps nor counts them, so both taps report `detail: 1` and a
   * detail-based guard only ever catches a mouse.
   */
  const focusedByTap = useRef(false);
  const lastBar = useRef<{ id: string; lane: number } | null>(null);

  const cancelTween = useCallback(() => {
    if (tween.current) cancelAnimationFrame(tween.current);
    tween.current = 0;
  }, []);

  // The gesture path reads the viewport from a ref, not from render scope: a
  // trackpad fires many events per frame and each must build on the last, not on
  // whatever React had rendered when the burst started.
  const viewportRef = useRef(current);
  viewportRef.current = current;

  // Layout the gesture handlers read through a ref rather than closing over.
  // Closing over it made every handler change identity whenever the gutter
  // opened, which re-ran the surface ref — and its cleanup cancelled an
  // in-flight focus animation at the exact moment the rows crossed the height
  // that opens the gutter. It also re-attached the wheel listener on every
  // layout change, for nothing.
  const layoutRef = useRef({
    limits,
    laneWidth,
    railWidth,
    peekWidth,
    extentOf,
    rowHeight,
    rows: prepared.rows,
    lanes: packing?.lanes ?? null,
    originMs: prepared.originMs,
    compression,
    packed,
    chartHeight,
  });
  layoutRef.current = {
    limits,
    laneWidth,
    railWidth,
    peekWidth,
    extentOf,
    rowHeight,
    rows: prepared.rows,
    lanes: packing?.lanes ?? null,
    originMs: prepared.originMs,
    compression,
    packed,
    chartHeight,
  };

  /**
   * Tell the caller which row is under the pointer, resolved from a VIEWPORT
   * rather than from the last pointermove: a zoom, a scroll, a zoom button and a
   * focus flight all slide a new row under a pointer that never moved. The
   * tooltip already follows that (`focusIndex` above re-derives every render),
   * but the callback did not, so the row the user is looking at was the one row
   * the caller never prefetched.
   */
  const notifyHover = (
    viewport: Viewport,
    // Only the surface-local point matters here; the viewport coordinates the
    // tooltip needs are not this function's business.
    at: { x: number; y: number } | null = pointerPosRef.current,
  ): void => {
    if (!at || !onHover) return;
    const live = layoutRef.current;
    const index = rowIndexAtOffset(
      viewport,
      at.y,
      live.rowHeight,
      live.rows.length,
    );
    const xInLane = at.x - live.railWidth;
    if (live.packed && xInLane < 0) return;
    const id =
      index == null
        ? null
        : spanAtPointer({
            rows: live.rows,
            lanes: live.lanes,
            originMs: live.originMs,
            compression: live.compression,
            packed: live.packed,
            lane: index,
            compressedMs:
              viewport.time.start +
              (xInLane / Math.max(live.laneWidth, 1)) * viewport.time.duration,
          });
    if (!id || id === hoveredRef.current) return;
    hoveredRef.current = id;
    onHover(id);
  };
  // Reached through a ref from the stable callbacks below, the same way they
  // reach the zoom pair: they attach once and must not close over this render.
  const notifyHoverRef = useRef(notifyHover);
  notifyHoverRef.current = notifyHover;

  /**
   * Zooming and re-anchoring are ONE operation, not two: `anchorTimeToRows`
   * exists precisely so a zoom cannot land on empty air, so every zoom entry
   * point owes it. Keeping the pair in one place is what stops a change to one
   * gesture from quietly not applying to the other.
   *
   * Plain functions, not `useCallback`: they are called from event handlers, so
   * their identity is nobody's dependency, and they read everything live from the
   * refs above.
   */
  const zoomAndAnchor = (
    from: Viewport | null,
    options: { factor: number; xRatio: number; yRatio: number },
  ) => {
    const { limits: live, extentOf: extent } = layoutRef.current;
    const zoomed = zoomViewportRevealLabels(
      from ? clampViewport(from, live) : fitViewport(live),
      live,
      options,
    );
    return anchorTimeToRows(zoomed, live, extent);
  };

  // The wheel path is a stable callback — the listener attaches once — so it
  // reaches the pair through a ref rather than closing over this render's copy.
  const zoomAndAnchorRef = useRef(zoomAndAnchor);
  zoomAndAnchorRef.current = zoomAndAnchor;

  /**
   * The one place a viewport lands from an event handler: the ref stays
   * authoritative for the next gesture frame, React renders it, and the row now
   * under the pointer is re-notified. (The reveal below writes ref + state
   * directly instead — it runs during render, where a callback must not fire.)
   */
  const commit = (next: Viewport) => {
    viewportRef.current = next;
    setViewport(next);
    notifyHover(next);
  };

  const zoomBy = (factor: number, xRatio: number, yRatio: number) => {
    // A gesture takes over from a flight in progress rather than fighting it.
    // Without this the tween's rAF loop kept writing its own interpolated target
    // over the user's zoom for the rest of the 320ms flight — press a zoom button
    // right after a double-click and the button did nothing.
    cancelTween();
    commit(zoomAndAnchor(viewportRef.current, { factor, xRatio, yRatio }));
  };

  const panBy = (dxPx: number, dyPx: number) => {
    cancelTween();
    const { limits: live, laneWidth: width } = layoutRef.current;
    commit(
      panViewport(clampViewport(viewportRef.current, live), live, {
        dxPx,
        dyPx,
        boxWidth: width,
      }),
    );
  };

  // Selection is not always ours to place. The tree, a search hit and a deep
  // link all select rows, and a highlight you cannot see is not a highlight —
  // on a trace this dense the chosen row is usually outside the window, and
  // `layout()` does not even emit a node for it. So an EXTERNAL change reveals
  // its row: pan both axes just far enough, never zoom, because "look at this
  // one" is not a request to change how far in you are looking.
  // Adjusting state during render is React's own answer to "a prop changed and
  // some state must follow" — the superseded render never reaches the screen.
  // `undefined`, not `selectedId`: mounting with a selection already set IS the
  // deep-link case, and it has to be revealed like any other.
  const revealedRef = useRef<string | null | undefined>(undefined);
  if (selectedId !== revealedRef.current) {
    const index = selectedId
      ? prepared.rows.findIndex((row) => row.node.id === selectedId)
      : -1;
    const row = index >= 0 ? prepared.rows[index] : undefined;
    // Marked handled only once the row EXISTS. A deep link can name an
    // observation that is not in the rows yet — fetched by id, or past the
    // load cap — and advancing the ref regardless meant the one chance to reveal
    // it was spent on an absent row: the highlight then stayed off-screen until
    // the user panned. Left un-advanced, the next render with rows retries.
    if (!selectedId || row) revealedRef.current = selectedId;
    if (row) {
      const offsets = spanOffsetsOf(row.node, prepared.originMs);
      const revealed = revealViewport(current, limits, {
        rowIndex: packing?.lanes[index] ?? index,
        startMs: compression.toCompressedMs(offsets.startMs),
        endMs: compression.toCompressedMs(offsets.endMs),
      });
      if (!viewportsEqual(revealed, current)) {
        // A flight in progress was aimed at the old selection.
        cancelTween();
        viewportRef.current = revealed;
        setViewport(revealed);
      }
    }
  }

  // A new query reveals its first hit, for exactly the reason a new selection
  // reveals its row: on a trace this dense the first match is usually outside
  // the window, and a highlight you cannot see is not a highlight. Same pan,
  // never a zoom — "show me the matches" is not a request to change how far in
  // you are looking.
  //
  // Keyed on the QUERY, not on the hit's id: retyping what is already in the box
  // must not re-pan, and two different queries that happen to land on the same
  // row should each be revealed. Ordered after the selection reveal and built on
  // `viewportRef.current` rather than `current`, so when a click and a keystroke
  // land in the same render the newer intent wins instead of the two fighting.
  const revealedQueryRef = useRef<string | null>(null);
  const searchKey = search?.query ?? null;
  if (searchKey !== revealedQueryRef.current) {
    const index = searchKey
      ? prepared.rows.findIndex((row) => search?.matchedIds.has(row.node.id))
      : -1;
    const row = index >= 0 ? prepared.rows[index] : undefined;
    // Same lesson as the selection reveal: with no rows yet there is nothing to
    // reveal and nothing to conclude, so leave the query un-handled and let the
    // next render with rows retry. With rows, "no hit" is an answer.
    if (!searchKey || prepared.rows.length > 0)
      revealedQueryRef.current = searchKey;
    if (row) {
      const base = viewportRef.current;
      const offsets = spanOffsetsOf(row.node, prepared.originMs);
      const revealed = revealViewport(base, limits, {
        rowIndex: packing?.lanes[index] ?? index,
        startMs: compression.toCompressedMs(offsets.startMs),
        endMs: compression.toCompressedMs(offsets.endMs),
      });
      if (!viewportsEqual(revealed, base)) {
        cancelTween();
        viewportRef.current = revealed;
        setViewport(revealed);
      }
    }
  }

  // Deltas accumulate and apply once per animation frame — the other half of
  // what makes map zoom feel immediate instead of laggy under a burst.
  const pending = useRef({
    levels: 0,
    dxPx: 0,
    dyPx: 0,
    xRatio: 0.5,
    yRatio: 0.5,
    frame: 0,
  });

  const releaseOverride = useCallback(() => {
    setOverride((held) => (held === "expanded" ? null : held));
    setPeeking(false);
  }, []);

  const flushGesture = useCallback(() => {
    const queued = pending.current;
    queued.frame = 0;
    const { limits: live, laneWidth: width } = layoutRef.current;
    let next = viewportRef.current;
    if (queued.levels !== 0) {
      next = zoomAndAnchorRef.current(next, {
        factor: 2 ** queued.levels,
        xRatio: queued.xRatio,
        yRatio: queued.yRatio,
      });
    }
    if (queued.dxPx !== 0 || queued.dyPx !== 0) {
      next = panViewport(next, live, {
        dxPx: queued.dxPx,
        dyPx: queued.dyPx,
        boxWidth: width,
      });
    }
    queued.levels = 0;
    queued.dxPx = 0;
    queued.dyPx = 0;
    if (viewportsEqual(next, viewportRef.current)) return;
    viewportRef.current = next;
    setViewport(next);
    notifyHoverRef.current(next);
  }, []);

  /** Ease-in-out, so the flight starts and lands softly. */
  const flyTo = useCallback(
    (target: Viewport) => {
      cancelTween();
      const from = viewportRef.current;
      const startedAt = performance.now();
      const step = (now: number) => {
        const linear = Math.min((now - startedAt) / FOCUS_ANIMATION_MS, 1);
        const eased =
          linear < 0.5 ? 2 * linear * linear : 1 - (-2 * linear + 2) ** 2 / 2;
        const next = interpolateViewport(from, target, eased);
        viewportRef.current = next;
        setViewport(next);
        // Per frame, but `hoveredRef` collapses it to one call per row crossed.
        notifyHoverRef.current(next);
        tween.current = linear < 1 ? requestAnimationFrame(step) : 0;
      };
      tween.current = requestAnimationFrame(step);
    },
    [cancelTween],
  );

  /** Double-click an element: both axes move to put it on screen, readably. */
  const focusRow = (nodeId: string) => {
    const positioned = result.nodes.find((node) => node.id === nodeId);
    if (!positioned) return;
    // The click that opened this double-click already selected the row, and this
    // flight is about to put it exactly where it should be — so the reveal below
    // must not also chase it and cancel the animation.
    revealedRef.current = nodeId;
    const startMs = compression.toCompressedMs(positioned.startMs);
    flyTo(
      focusViewport(limits, {
        rowIndex: positioned.index,
        startMs,
        durationMs: compression.toCompressedMs(positioned.endMs) - startMs,
      }),
    );
  };

  const showLabels = () => {
    const { limits: live, extentOf } = layoutRef.current;
    setLabelsPinned(true);
    setOverride(null);
    flyTo(
      anchorTimeToRows(
        expandRowsToReadable(viewportRef.current, live),
        live,
        extentOf,
      ),
    );
  };

  const scheduleGesture = useCallback(() => {
    // Any gesture on the chart hands the space back: an expanded gutter is for
    // looking, and the moment you work in the chart it gets out of the way. It
    // also takes over from an animation in flight rather than fighting it.
    cancelTween();
    releaseOverride();
    if (pending.current.frame) return;
    pending.current.frame = requestAnimationFrame(flushGesture);
  }, [flushGesture, releaseOverride, cancelTween]);

  // Shared with spatial explorers: device input is independent of row layout.
  // The timeline keeps its own pointer path because mouse drag draws a marquee.
  usePanZoomGestures({
    target: surfaceRef,
    pointerPan: false,
    onInteractionStart: () => {
      cancelTween();
      releaseOverride();
    },
    canPan: (dxPx, dyPx) => {
      const { limits: live, laneWidth: width } = layoutRef.current;
      return !viewportsEqual(
        panViewport(viewportRef.current, live, { dxPx, dyPx, boxWidth: width }),
        viewportRef.current,
      );
    },
    onPan: (dxPx, dyPx) => {
      const { limits: live, laneWidth: width } = layoutRef.current;
      const next = panViewport(viewportRef.current, live, {
        dxPx,
        dyPx,
        boxWidth: width,
      });
      viewportRef.current = next;
      setViewport(next);
      notifyHoverRef.current(next);
    },
    onZoom: (levels, anchor) => {
      const {
        railWidth: rail,
        laneWidth: width,
        chartHeight: tall,
      } = layoutRef.current;
      const rect = surfaceRef.current?.getBoundingClientRect();
      const surfaceWidth = rect?.width ?? width + rail;
      const surfaceHeight = rect?.height ?? tall;
      const next = zoomAndAnchorRef.current(viewportRef.current, {
        factor: 2 ** levels,
        xRatio:
          (anchor.x * surfaceWidth - rail) / Math.max(surfaceWidth - rail, 1),
        // The lanes occupy chartHeight at the top of a taller surface. A
        // ratio of the whole surface puts the anchor above the lane it hit.
        yRatio: clampRatio((anchor.y * surfaceHeight) / Math.max(tall, 1)),
      });
      viewportRef.current = next;
      setViewport(next);
      notifyHoverRef.current(next);
    },
  });

  const attachSurface = useCallback(
    (element: HTMLDivElement | null) => {
      surfaceRef.current = element;
      if (!element) return;
      return cancelTween;
    },
    [cancelTween],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // A click that never arrived (a drag, a tap outside a row) must not leave the
    // suppression armed for the next real one.
    focusedByTap.current = false;
    // Touch has no hover, so a tap on the rail is the toggle — but only a FIRST
    // finger. A pinch whose first finger happens to land near the left edge was
    // otherwise swallowed by this branch and never became a pinch at all.
    const offsetX =
      event.clientX - event.currentTarget.getBoundingClientRect().left;
    if (
      touches.current.points.size === 0 &&
      (pointer === "coarse" || event.pointerType === "touch") &&
      // There has to BE something to toggle. At hairline density the left side
      // takes no width, so this collapsed to "the leftmost 6px" and a tap there
      // set an override with nothing to show for it — which then sprang the names
      // open later, the moment a focus zoom grew the rows enough to honour it.
      !packed &&
      canShowNames &&
      offsetX <= Math.max(railWidth, peekWidth) + PEEK_MARGIN_PX
    ) {
      // Peek overlays never become committedOpen (the pane is too narrow
      // to give the gutter a lane). Toggle on the held-open state so a
      // second tap can dismiss a peek the first tap — or Show labels —
      // just opened.
      const namesHeldOpen =
        committedOpen || labelsPinned || override === "expanded";
      setLabelsPinned(!namesHeldOpen);
      setOverride(namesHeldOpen ? "collapsed" : "expanded");
      // This tap is spent on the toggle, so it is not half of a double-tap:
      // opening and closing the names inside the double-tap window otherwise read
      // as one, and flew the viewport to whatever row the second tap landed on.
      // Forgetting the pending tap is enough — a tap NEAR the rail is a rail tap
      // and lands here too, and a tap far from it fails the proximity check.
      lastTap.current = { at: 0, x: 0, y: 0 };
      return;
    }
    // Every pointer type reaches here now: the box is decided below and drawn on
    // the first real move, so nothing returns early any more.
    //
    // A PRIMARY contact is the first of a new gesture, so anything left in
    // the map is stale by definition. Not every release arrives — lift two
    // fingers at once and a `pointerup` can go missing, or land outside the
    // element — and one phantom finger turns the next one-finger drag into a
    // pinch, which showed up as a pan that also zoomed a little.
    if (event.isPrimary) {
      touches.current.points.clear();
      touches.current.distance = 0;
    }
    touches.current.points.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (touches.current.points.size === 2) {
      // A second finger ends whatever the first one was doing and starts a
      // pinch from where the two currently are — INCLUDING a box it had begun
      // to draw. Left behind, that rectangle outlives the pinch and the next
      // release flies to it, since every release commits whatever box it finds.
      gesture.current.down = false;
      gesture.current.dragging = false;
      gesture.current.intent = "pan";
      setMarqueeBox(null);
      setDragging(false);
      const [a, b] = [...touches.current.points.values()];
      if (a && b) {
        touches.current.distance = Math.hypot(b.x - a.x, b.y - a.y);
        touches.current.midpoint = {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
        };
      }
      return;
    }

    // Drag draws a box to zoom into: the one gesture where the user states the
    // window on BOTH axes, so it goes straight there rather than picking a level
    // for them. It needs no modifier — scroll already pans both axes, so drag is
    // free, and a modifier nobody guesses is not a gesture, it is a footnote.
    // Touch is the exception: one finger keeps panning, because a finger has no
    // scroll wheel to pan with and drawing a box with one is nobody's instinct.
    //
    // Decided here and ACTED ON in pointermove. A press is not yet a drag, and
    // capturing the pointer before it is one retargets the click that follows
    // away from the row — which silently kills click-to-select, and no synthetic
    // event in a test can see it happen. Both gestures wait for the threshold.
    const rect = event.currentTarget.getBoundingClientRect();
    gesture.current = {
      down: true,
      dragging: false,
      x: event.clientX,
      y: event.clientY,
      intent: event.pointerType !== "touch" || event.shiftKey ? "zoom" : "pan",
      originX: event.clientX - rect.left,
      originY: event.clientY - rect.top,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Two fingers: pinch to zoom BOTH axes about the midpoint, and pan by
    // however far that midpoint travelled — the two happen together on a map,
    // and separating them makes a pinch feel like it fights the drag. Both go
    // through a per-frame accumulator, with the same zoom-then-reanchor and
    // cancelling of a focus flight as wheel input.
    const active = touches.current;
    // Self-heal the other way too: no contact for this pointer means it is not
    // down, whatever we were told.
    if (event.buttons === 0 && active.points.has(event.pointerId)) {
      active.points.delete(event.pointerId);
      active.distance = 0;
    }
    if (active.points.has(event.pointerId) && active.points.size >= 2) {
      active.points.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      const [a, b] = [...active.points.values()];
      if (!a || !b) return;
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const rect = event.currentTarget.getBoundingClientRect();
      const queued = pending.current;

      if (active.distance > 0 && distance > 0) {
        // A ratio of distances is a ratio of scales, and the accumulator speaks
        // in zoom LEVELS — one level per doubling.
        queued.levels += Math.log2(distance / active.distance);
        const rail = layoutRef.current.railWidth;
        queued.xRatio =
          rect.width > rail
            ? clampRatio((midpoint.x - rect.left - rail) / (rect.width - rail))
            : 0.5;
        const tall = Math.max(layoutRef.current.chartHeight, 1);
        queued.yRatio = clampRatio((midpoint.y - rect.top) / tall);
      }
      queued.dxPx += midpoint.x - active.midpoint.x;
      queued.dyPx += midpoint.y - active.midpoint.y;

      active.distance = distance;
      active.midpoint = midpoint;
      event.preventDefault();
      scheduleGesture();
      return;
    }
    if (active.points.has(event.pointerId)) {
      active.points.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
    }

    const drawing = marqueeRef.current;
    if (drawing) {
      const rect = event.currentTarget.getBoundingClientRect();
      setMarqueeBox({
        from: drawing.from,
        to: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      });
      return;
    }

    const state = gesture.current;
    if (state.down) {
      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;
      if (!state.dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
        state.dragging = true;
        setDragging(true);
        // Capture only once it really is a drag, so a click still reaches a row.
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      if (state.dragging && state.intent === "zoom") {
        const surface = event.currentTarget.getBoundingClientRect();
        setMarqueeBox({
          from: { x: state.originX, y: state.originY },
          to: {
            x: event.clientX - surface.left,
            y: event.clientY - surface.top,
          },
        });
        return;
      }
      if (state.dragging) {
        releaseOverride();
        panBy(dx, dy);
        state.x = event.clientX;
        state.y = event.clientY;
        return;
      }
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    const offsetX = event.clientX - rect.left;

    // Peek is hover-driven on a fine pointer only: a coarse pointer has no
    // hover, so it toggles on tap instead (see onPointerDown).
    if (pointer === "fine" && event.pointerType !== "touch") {
      setPeeking(offsetX <= Math.max(railWidth, peekWidth) + PEEK_MARGIN_PX);
    }

    const lane = rowIndexAtOffset(current, offsetY, rowHeight, rowCount);
    const overBar =
      lane == null
        ? null
        : hitIdAt(result.nodes, lane, offsetX - railWidth, packed);
    if (overBar != null && lane != null)
      lastBar.current = { id: overBar, lane };
    notifyHover(current, { x: offsetX, y: offsetY });
    setPointerPos({
      x: offsetX,
      y: offsetY,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  };

  /** Release of a zoom drag: fly to the box, if it is big enough to mean one. */
  const commitMarquee = () => {
    const box = marqueeRef.current;
    if (!box) return;
    setMarqueeBox(null);
    const width = Math.abs(box.to.x - box.from.x);
    const height = Math.abs(box.to.y - box.from.y);
    // A stray shift-click is not a zoom to a pinhole.
    if (width < MARQUEE_MIN_PX && height < MARQUEE_MIN_PX) return;
    const lane = Math.max(laneWidth, 1);
    const tall = Math.max(chartHeight, 1);
    flyTo(
      zoomToBox(current, limits, {
        xStartRatio: (box.from.x - railWidth) / lane,
        xEndRatio: (box.to.x - railWidth) / lane,
        yStartRatio: box.from.y / tall,
        yEndRatio: box.to.y / tall,
      }),
    );
  };

  /**
   * A pointer left. Lifting one finger of a pinch does NOT end the gesture — the
   * survivor becomes a one-finger pan — so its drag origin has to be re-anchored
   * on where that finger actually is. Inheriting the departed finger's origin
   * makes the survivor's next small move pan by the whole finger separation.
   */
  const releasePointer = (pointerId: number) => {
    const active = touches.current;
    active.points.delete(pointerId);
    if (active.points.size === 1) {
      const [survivor] = [...active.points.values()];
      if (survivor) {
        gesture.current = {
          down: true,
          dragging: false,
          x: survivor.x,
          y: survivor.y,
          intent: "pan",
          originX: 0,
          originY: 0,
        };
        setDragging(false);
        return;
      }
    }
    if (active.points.size === 0) {
      active.distance = 0;
      gesture.current.down = false;
      gesture.current.dragging = false;
      setDragging(false);
    }
  };

  const maybeDoubleTap = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return; // the mouse has a real dblclick
    if (touches.current.points.size > 1 || gesture.current.dragging) return;
    const now = event.timeStamp;
    const previous = lastTap.current;
    const near =
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <
      DOUBLE_TAP_SLOP_PX;
    if (now - previous.at < DOUBLE_TAP_MS && near) {
      lastTap.current = { at: 0, x: 0, y: 0 };
      const rect = event.currentTarget.getBoundingClientRect();
      const index = rowIndexAtOffset(
        current,
        event.clientY - rect.top,
        rowHeight,
        rowCount,
      );
      if (index != null) {
        const id = hitIdAt(
          result.nodes,
          index,
          event.clientX - rect.left - railWidth,
          packed,
        );
        if (id) {
          focusedByTap.current = true;
          focusRow(id);
        }
      }
      return;
    }
    lastTap.current = { at: now, x: event.clientX, y: event.clientY };
  };

  const endGesture = useCallback(() => {
    gesture.current.down = false;
    gesture.current.dragging = false;
    setDragging(false);
  }, []);

  const clearFocus = useCallback(() => {
    setPointerPos(null);
    hoveredRef.current = null;
    setPeeking(false);
    endGesture();
  }, [endGesture]);

  /**
   * Shared by the bar rows and the hover peek tree. Selecting is not free
   * (analytics + reopen the detail panel), and a double-click's second click
   * must not fire it again.
   */
  const selectRowOnClick = (event: { detail: number }, nodeId: string) => {
    if (event.detail > 1 || focusedByTap.current) return;
    onSelect?.(nodeId);
  };

  const xInLane = pointerPos == null ? null : pointerPos.x - railWidth;
  const barUnderPointer =
    focusIndex == null || xInLane == null
      ? null
      : hitIdAt(result.nodes, focusIndex, xInLane, packed);
  const gutterKeeps =
    packed &&
    xInLane != null &&
    xInLane < 0 &&
    lastBar.current?.lane === focusIndex
      ? lastBar.current.id
      : null;
  const focusedId = barUnderPointer ?? gutterKeeps;
  const ancestorLabel =
    packed && focusedId ? ancestorPath(roots, focusedId).join(" / ") : "";
  const focused = focusedId
    ? (result.nodes.find((node) => node.id === focusedId) ?? null)
    : null;
  const windowLabel = formatDurationMs(
    compression.toRealMs(current.time.start + current.time.duration) -
      compression.toRealMs(current.time.start),
  );
  const windowHint = `${windowLabel} window`;

  return (
    <div
      className="bg-background border-border text-foreground flex flex-col overflow-hidden rounded border select-none"
      style={{ width: `${box.width}px`, height: `${frameHeight}px` }}
      data-testid="timeline-dense-frame"
      data-layout={shownLayout}
    >
      <div
        className="border-border flex shrink-0 items-center gap-1 border-b px-1"
        style={{ height: `${TOOLBAR_HEIGHT}px` }}
        data-testid="timeline-dense-toolbar"
      >
        <ToolbarButton
          label="Zoom out"
          onClick={() => zoomBy(2 ** -BUTTON_ZOOM_LEVELS, 0.5, 0.5)}
        >
          <Minus size="sm" />
        </ToolbarButton>
        <ToolbarButton
          label="Zoom in"
          onClick={() =>
            offerShowLabels
              ? showLabels()
              : zoomBy(2 ** BUTTON_ZOOM_LEVELS, 0.5, 0.5)
          }
        >
          <Plus size="sm" />
        </ToolbarButton>
        {offerShowLabels ? (
          <ToolbarButton label="Show labels" onClick={showLabels}>
            <UnfoldVertical size="sm" />
            <span className="pr-0.5" style={{ fontSize: "10px" }}>
              Show labels
            </span>
          </ToolbarButton>
        ) : (
          <ToolbarButton
            label={fitSpent ? "Whole trace already fits" : "Fit whole trace"}
            onClick={() => {
              setLabelsPinned(false);
              setOverride(null);
              flyTo(fitViewport(limits));
            }}
            disabled={fitSpent}
          >
            {/* A viewfinder, not the diagonal arrows this used to wear: those
                read as "fullscreen", so a control that was merely spent looked
                broken. */}
            <Scan size="sm" />
          </ToolbarButton>
        )}
        {/* What the dimming means, said in words. Without it "nothing lit up"
            and "one hit, off to the left" look the same. */}
        {search ? (
          <span
            className="text-muted-foreground truncate text-xs"
            title={`${search.label} for “${search.query}”`}
            data-testid="timeline-dense-search-count"
          >
            {search.label}
          </span>
        ) : null}
        {/* Where you are, when you are somewhere — and nothing at all when the
            whole trace is in view. */}
        {!offerShowLabels && !fitted ? (
          <span
            className="text-muted-foreground truncate"
            style={{ fontSize: "10px" }}
            title={windowHint}
          >
            {windowHint}
          </span>
        ) : null}
        {onRowLayoutChange ? (
          <label className="ml-auto flex shrink-0 items-center gap-1 pr-1">
            <span
              className="text-muted-foreground"
              style={{ fontSize: "10px" }}
            >
              Packed
            </span>
            {packedSavesSpace ? (
              <Switch
                size="sm"
                color="green"
                checked={packed}
                aria-label="Packed layout"
                onCheckedChange={(checked) =>
                  onRowLayoutChange(checked ? "packed" : "tree")
                }
              />
            ) : (
              <Tooltip label="Packed view would not save space for this trace">
                {({ getTriggerProps }) => (
                  <span
                    {...getTriggerProps()}
                    className="inline-flex"
                    tabIndex={0}
                  >
                    <Switch
                      size="sm"
                      color="green"
                      checked={false}
                      disabled
                      aria-disabled="true"
                      aria-label="Packed layout"
                    />
                  </span>
                )}
              </Tooltip>
            )}
          </label>
        ) : null}
      </div>

      <div
        className="border-border relative shrink-0 border-b"
        style={{ height: `${AXIS_HEIGHT}px`, touchAction: "none" }}
        data-testid="timeline-dense-axis"
      >
        {/* Font probe for the measurer, at the size a label ACTUALLY renders in —
            `density.labelFontPx`, the same value the metrics set themselves in.
            Probing one size and rendering another under-prices every string by
            the difference, which is the direction that clips. Invisible and out
            of flow, so it costs no layout. */}
        <span
          ref={labelProbeRef}
          aria-hidden
          className="invisible absolute"
          style={{ fontSize: `${density.labelFontPx}px` }}
        >
          0
        </span>
        <div
          className="absolute inset-y-0 overflow-hidden"
          style={{ left: `${railWidth}px`, width: `${laneWidth}px` }}
        >
          {axisTickLabels.map(({ tick, side }) => (
            <div
              key={tick.realMs}
              className="border-border-contrast absolute inset-y-0 border-l"
              style={{ left: `${tick.x}px` }}
            >
              {side == null ? null : (
                <span
                  className="text-muted-foreground absolute whitespace-nowrap"
                  style={
                    side === "left"
                      ? {
                          right: TICK_LABEL_INSET_PX,
                          top: 0,
                          fontSize: `${TICK_FONT_PX}px`,
                        }
                      : {
                          left: TICK_LABEL_INSET_PX,
                          top: 0,
                          fontSize: `${TICK_FONT_PX}px`,
                        }
                  }
                  data-testid="timeline-tick-label"
                >
                  {tick.label}
                </span>
              )}
            </div>
          ))}
          {idleGapLabels(axisIdleLabels)}
        </div>
      </div>

      {/* The map surface. No scrollbars: panning is the gesture, and the
          viewport clamps to the content so there is nowhere to get lost. */}
      <div
        ref={attachSurface}
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden",
          // A grab hand promised panning, which drag no longer does — it draws a
          // zoom box, so the cursor says nothing until you start one and then
          // says exactly that. The rows carry the clickable cue themselves.
          dragging ? "cursor-crosshair" : "cursor-default",
        )}
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => {
          commitMarquee();
          maybeDoubleTap(event);
          releasePointer(event.pointerId);
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        }}
        onPointerLeave={clearFocus}
        onPointerCancel={(event) => {
          setMarqueeBox(null);
          releasePointer(event.pointerId);
          clearFocus();
        }}
        data-testid="timeline-dense-surface"
      >
        {/* The row layer clips its own rows. A row straddling the bottom edge
            is real and should be drawn, but it must not become overflow on the
            surface — a map has no scrollable extent. */}
        <div
          className="absolute inset-0 overflow-hidden"
          data-testid="timeline-dense-content"
        >
          <div
            className="pointer-events-none absolute inset-y-0"
            style={{ left: `${railWidth}px`, width: `${laneWidth}px` }}
          >
            {result.ticks.map((tick) => (
              <div
                key={tick.realMs}
                className="border-border/40 absolute inset-y-0 border-l"
                style={{ left: `${tick.x}px` }}
              />
            ))}
            {/* A collapsed idle gap says how much time it swallowed IN the band,
                because it cannot say it on hover: the rows are painted over this
                layer and cover its full width, so a `title` here is never
                reachable by a pointer. Narrow bands stay silent and leave it to
                the axis ticks at their edges. */}
            {result.gaps.map((gap) => {
              const sessionIdle =
                gap.durationMs >= IDLE_GAP_THRESHOLD_SECONDS * 1000;
              return (
                <div
                  key={`${gap.x}-${gap.durationMs}`}
                  className={
                    sessionIdle
                      ? "border-border absolute inset-y-0 overflow-hidden border-x border-dashed"
                      : "bg-muted border-border-contrast absolute inset-y-0 overflow-hidden border-x border-dashed"
                  }
                  data-testid={sessionIdle ? "timeline-idle-band" : undefined}
                  style={{ left: `${gap.x}px`, width: `${gap.width}px` }}
                >
                  {sessionIdle || gap.width < GAP_LABEL_MIN_WIDTH ? null : (
                    <span
                      className="text-muted-foreground flex h-full items-center justify-center font-mono whitespace-nowrap"
                      style={{ fontSize: "11px" }}
                    >
                      {`${gap.label} idle`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {result.nodes.map((node) => {
            const y = (node.index - current.rows.start) * rowHeight;
            if (y + rowHeight < 0 || y > chartHeight) return null;

            const isFocused = node.id === focused?.id;
            const isSelected = node.id === selectedId;
            // A miss under a live query. Not "hidden": the row keeps its place
            // on the clock, its click target and its hover, so the matches read
            // in the context of everything they sit between.
            const isDimmed = search != null && !search.matchedIds.has(node.id);
            const typeColor = TYPE_COLOR[node.type] ?? FALLBACK_COLOR;
            // One place decides the bar's colour, so the label can ask about the
            // exact class the bar got rather than guessing at it.
            //
            // Hue carries TYPE and nothing else. Recolouring a focused bar to the
            // accent meant a hovered generation turned the exact blue that means
            // SPAN, so the palette contradicted itself precisely when someone was
            // inspecting a row. Focus is the row's wash (full width, so it reads
            // at any density) and selection adds a ring — neither touches hue.
            const barClass = barColor === "type" ? typeColor : NEUTRAL_COLOR;

            return (
              <div
                key={node.id}
                className={cn(
                  "absolute inset-x-0",
                  packed && "pointer-events-none",
                  rowWashClass({
                    selected: isSelected,
                    focused: isFocused,
                  }),
                )}
                style={{ top: `${y}px`, height: `${rowHeight}px` }}
                data-testid="timeline-dense-row"
                onClick={
                  packed
                    ? undefined
                    : (event) => selectRowOnClick(event, node.id)
                }
                onDoubleClick={packed ? undefined : () => focusRow(node.id)}
              >
                {/* Bird's-eye density has no rail; avoid invisible DOM per row.
                    Packed lanes hold several spans, so only the span under the
                    pointer gets a name — the others would paint on top of it. */}
                {railWidth > 0 && (!packed || isFocused) && (
                  <GutterContent
                    node={node}
                    width={railWidth}
                    rowHeight={rowHeight}
                    barHeight={barHeight}
                    showName={namesVisible}
                    dimmed={isDimmed}
                  />
                )}

                {/* Dimming sits on the lane, so the bar, the caret and the
                    label all fade together — a full-strength duration beside a
                    ghost bar reads as two rows. The row's own wash is outside
                    it, so the selected row stays findable while a query is
                    live. */}
                <div
                  className={cn(
                    "absolute inset-y-0 overflow-hidden",
                    isDimmed && SEARCH_DIM_OPACITY,
                  )}
                  style={{ left: `${railWidth}px`, width: `${laneWidth}px` }}
                >
                  {/* A span outside the time window is clamped to the lane edge
                      by layout(). Drawing it as a bar stacked every out-of-view
                      span into a column of marks that corresponds to nothing —
                      so it becomes a caret at the edge it lies beyond, and the
                      row itself stays for hover and selection. */}
                  {node.offscreen ? (
                    <div
                      className={cn("absolute w-[2px] opacity-40", barClass)}
                      style={{
                        left: node.x <= 0 ? "0px" : undefined,
                        right: node.x <= 0 ? undefined : "0px",
                        top: `${Math.max((rowHeight - barHeight) / 2, 0)}px`,
                        height: `${barHeight}px`,
                      }}
                      title={`Outside the time window — starts at ${formatDurationMs(node.startMs)}`}
                      data-testid="timeline-dense-offscreen"
                    />
                  ) : (
                    <div
                      className={cn(
                        // Clicking selects, and the bar is the part that looks
                        // like it would: the row is clickable across its full
                        // width, but only the bar reads as a thing. Packed
                        // rows share a lane, so the bar itself takes the click.
                        "absolute rounded-[1px]",
                        packed && "pointer-events-auto",
                        onSelect && "cursor-pointer",
                        barClass,
                        isSelected && "ring-foreground/80 ring-1",
                      )}
                      onClick={
                        packed
                          ? (event) => {
                              event.stopPropagation();
                              selectRowOnClick(event, node.id);
                            }
                          : undefined
                      }
                      onDoubleClick={
                        packed
                          ? (event) => {
                              event.stopPropagation();
                              focusRow(node.id);
                            }
                          : undefined
                      }
                      style={{
                        left: `${node.x}px`,
                        width: `${node.width}px`,
                        top: `${Math.max((rowHeight - barHeight) / 2, 0)}px`,
                        height: `${barHeight}px`,
                      }}
                      data-testid="timeline-dense-bar"
                    >
                      {/* Where the first token arrived: a divider rather than the
                          wide timeline's second shade, because a shade needs a
                          bar tall enough to read one and these are 1px at the
                          floor. It also keeps the label's contrast decision on a
                          single colour. */}
                      {node.firstTokenX == null ? null : (
                        <div
                          className="bg-background/70 absolute inset-y-0 w-px"
                          style={{
                            left: `${Math.min(Math.max(node.firstTokenX - node.x, 0), node.width)}px`,
                          }}
                          data-testid="timeline-dense-first-token"
                        />
                      )}
                    </div>
                  )}
                  {/* Text comes back on its own as the rows grow — and it goes
                      on whichever side layout() measured room for, rather than
                      always after the bar, which clipped a full-width bar's
                      label at the lane edge. */}
                  {presentation === "labelled" &&
                  !node.offscreen &&
                  (!packed || node.labelPlacement === "inside") ? (
                    <TimelineRowMetrics
                      row={node}
                      laneWidth={laneWidth}
                      measurer={measurer}
                      density={density}
                      metrics={metricsOf?.(node.id) ?? {}}
                      showDuration={showDuration}
                      insideOnly={packed}
                      gaps={result.gaps.filter(
                        (gap) =>
                          gap.durationMs >= IDLE_GAP_THRESHOLD_SECONDS * 1000,
                      )}
                      toneClass={
                        barTones[barClass] === "dark"
                          ? "text-black/85"
                          : "text-white/95"
                      }
                    />
                  ) : null}
                </div>
              </div>
            );
          })}

          {/* The box being drawn. Shown over everything so it reads as a
              selection rather than as part of the chart. */}
          {marquee ? (
            <div
              className="border-primary bg-primary/10 pointer-events-none absolute border border-dashed"
              style={{
                left: `${Math.min(marquee.from.x, marquee.to.x)}px`,
                top: `${Math.min(marquee.from.y, marquee.to.y)}px`,
                width: `${Math.abs(marquee.to.x - marquee.from.x)}px`,
                height: `${Math.abs(marquee.to.y - marquee.from.y)}px`,
              }}
              data-testid="timeline-dense-marquee"
            />
          ) : null}
        </div>

        {/* Peek: the same gutter content, floating OVER the chart. The bars keep
            their geometry, so looking at the names never moves what you are
            looking at. */}
        {peekWidth > 0 ? (
          <div
            className="border-border bg-background/95 absolute inset-y-0 left-0 overflow-hidden border-r backdrop-blur-[2px]"
            style={{ width: `${peekWidth}px` }}
            data-testid="timeline-dense-peek"
          >
            {result.nodes.map((node) => {
              const y = (node.index - current.rows.start) * rowHeight;
              if (y + rowHeight < 0 || y > chartHeight) return null;
              if (packed && node.id !== focused?.id) return null;
              return (
                <div
                  key={node.id}
                  className={cn(
                    "absolute inset-x-0",
                    onSelect && "cursor-pointer",
                    rowWashClass({
                      selected: node.id === selectedId,
                      focused: node.id === focused?.id,
                    }),
                  )}
                  style={{ top: `${y}px`, height: `${rowHeight}px` }}
                  data-testid="timeline-dense-peek-row"
                  onClick={(event) => selectRowOnClick(event, node.id)}
                  onDoubleClick={() => focusRow(node.id)}
                >
                  <GutterContent
                    node={node}
                    width={peekWidth}
                    rowHeight={rowHeight}
                    barHeight={barHeight}
                    showName
                    dimmed={search != null && !search.matchedIds.has(node.id)}
                  />
                </div>
              );
            })}
          </div>
        ) : null}

        {/* The tooltip is what names a row when the gutter cannot — and it is the
            one thing here that belongs OUTSIDE the box. Kept inside, it had to be
            clamped to the space left, which on the bottom rows of a short panel
            meant clamping it against a guess at its own height and cutting the
            metrics line off. In the tooltip layer nothing clips it, and the
            surface still has nothing to scroll because it is not in the surface.

            It anchors to whichever side of the pointer has room rather than
            measuring itself: the side with room is known from the pointer alone,
            a size is not, and a tooltip that has to be measured before it can be
            placed is a tooltip that renders once in the wrong place. */}
        {focused && pointerPos && !dragging ? (
          <Layer name="tooltip">
            <div
              className="border-border bg-background text-foreground pointer-events-none fixed flex flex-col gap-0.5 rounded border px-1.5 py-1 shadow-md"
              style={tooltipStyle(
                tooltipPlacement({
                  clientX: pointerPos.clientX,
                  clientY: pointerPos.clientY,
                  viewportWidth: window.innerWidth,
                  viewportHeight: window.innerHeight,
                }),
              )}
              data-testid="timeline-dense-tooltip"
            >
              {/* Two rows, like a tree row: identity, then the metrics. One row
                  made the NAME the only flexible item, so adding cost and tokens
                  truncated it away — and the name is the thing you hovered for. */}
              <span className="flex items-center gap-1">
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-[1px]",
                    TYPE_COLOR[focused.type] ?? FALLBACK_COLOR,
                  )}
                />
                <span className="truncate" title={focused.name}>
                  {focused.name}
                </span>
                {/* What the colour means, next to the colour. */}
                {focused.type ? (
                  <span className="text-muted-foreground shrink-0">
                    {typeLabel(focused.type)}
                  </span>
                ) : null}
              </span>
              {ancestorLabel.length > 0 ? (
                <span
                  className="text-muted-foreground truncate"
                  title={ancestorLabel}
                >
                  {ancestorLabel}
                </span>
              ) : null}
              {/* Duration and cost. NOT the start offset: the bar's own position
                  on the axis is what says when a span began, and saying it again
                  in words was one more number to read past — `@0ms` on a root
                  meaning nothing, and two unlabelled durations side by side
                  reading as one number repeated. */}
              <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span>
                  {focused.durationMs == null
                    ? "—"
                    : formatDurationMs(focused.durationMs)}
                </span>
                {metricsOf?.(focused.id)?.costText ? (
                  <span>{metricsOf(focused.id).costText}</span>
                ) : null}
              </span>
            </div>
          </Layer>
        ) : null}
      </div>

      {showReadout ? (
        <div
          className="border-border text-muted-foreground flex shrink-0 items-center gap-2 overflow-hidden border-t px-1 whitespace-nowrap"
          style={{ height: `${READOUT_HEIGHT}px`, fontSize: "10px" }}
          data-testid="timeline-dense-readout"
        >
          <span>
            {box.width}×{box.height} · lane {laneWidth}
          </span>
          <span data-testid="dense-rowheight">
            {rowHeight.toFixed(1)}px rows ({presentation})
          </span>
          <span data-testid="dense-rows">
            rows {current.rows.start.toFixed(1)}–
            {(current.rows.start + current.rows.count).toFixed(1)} of {rowCount}
          </span>
          <span>{result.pxPerMs.toFixed(3)} px/ms</span>
          <span>{fitted ? "fitted" : "zoomed"}</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The left side of one row: type square when closed, and the production gutter's
 * own vocabulary when open — connector rails, the observation's ItemBadge icon,
 * its name, indented by depth. Shared by the in-flow rail and the peek overlay so
 * the two cannot drift apart.
 */
/** The placement as inline style. Split out so the geometry stays pure. */
/** Names above a span, so a packed bar still says which trace it sits under. */
function ancestorPath(roots: readonly LayoutNode[], id: string): string[] {
  const found: string[] = [];
  const visit = (node: LayoutNode, stack: string[]): boolean => {
    if (node.id === id) {
      found.push(...stack);
      return true;
    }
    const next = stack.concat(node.name);
    for (const child of node.children) {
      if (visit(child, next)) return true;
    }
    return false;
  };
  for (const root of roots) {
    if (visit(root, [])) return found;
  }
  return found;
}

function tooltipStyle(placement: TooltipPlacement): CSSProperties {
  return {
    left: `${Math.round(placement.left)}px`,
    top: `${Math.round(placement.top)}px`,
    transform: placement.transform,
    maxWidth: `${Math.round(placement.maxWidth)}px`,
    fontSize: "10px",
  };
}

function GutterContent({
  node,
  width,
  rowHeight,
  barHeight,
  showName,
  dimmed = false,
}: {
  node: PositionedNode;
  width: number;
  rowHeight: number;
  barHeight: number;
  showName: boolean;
  /**
   * This row missed the active search. The name and the type square fade with
   * the bar beside them — a full-strength name next to a ghost bar is the row
   * shouting and whispering at once.
   */
  dimmed?: boolean;
}) {
  // RAIL_MAX_DEPTH exists to keep a tiny square inside a 15px rail, and applying
  // it to the OPEN gutter flattened the tree: every node past depth 4 drew at the
  // same indent and the same connector column in a gutter up to 168px wide. The
  // open gutter caps on the width it actually has instead — deep traces still
  // need a cap (a 1401-deep chain would push every name out of the box), but it
  // is the one the gutter can afford, leaving room for the icon and a name.
  const depthCap = showName
    ? Math.max(
        Math.floor(
          (width - GUTTER_INSET - GUTTER_ICON - GUTTER_NAME_MIN) /
            GUTTER_INDENT,
        ),
        0,
      )
    : RAIL_MAX_DEPTH;
  const depth = Math.min(node.depth, depthCap);
  const typeColor = TYPE_COLOR[node.type] ?? FALLBACK_COLOR;
  // The square must end up INSIDE the rail, so its size and its indent are both
  // bounded by the width it has to live in — not by the row height alone.
  const squareSize = Math.max(
    Math.min(barHeight, RAIL_SQUARE_MAX, width - RAIL_INDENT),
    2,
  );
  const indent = showName
    ? GUTTER_INSET + depth * GUTTER_INDENT
    : Math.min(depth * RAIL_INDENT + 1, Math.max(width - squareSize - 1, 0));
  /** x of this row's own rail, and of its parent's. */
  const railX = depth * GUTTER_INDENT + GUTTER_RAIL;
  // The PARENT's RENDERED depth, which is not always one less than this row's:
  // past the cap a parent and its child both flatten to the same indent, and an
  // elbow drawn an indent to the left of a spine that never went there is a tree
  // whose lines stop meeting — for the whole flattened tail of a deep trace.
  const parentRailX =
    Math.min(node.depth - 1, depthCap) * GUTTER_INDENT + GUTTER_RAIL;

  return (
    <div
      className="absolute inset-y-0 overflow-hidden"
      style={{ width: `${width}px` }}
    >
      {showName
        ? node.treeLines
            .slice(0, depth)
            .map((continues, level) =>
              continues ? (
                <div
                  key={level}
                  className="bg-border-contrast absolute inset-y-0 w-px"
                  style={{ left: `${level * GUTTER_INDENT + GUTTER_RAIL}px` }}
                />
              ) : null,
            )
        : null}
      {showName && depth > 0 ? (
        <>
          {node.isLastSibling ? null : (
            <div
              className="bg-border-contrast absolute inset-y-0 w-px"
              style={{ left: `${parentRailX}px` }}
            />
          )}
          <div
            className="border-border-contrast absolute top-0 rounded-bl-md border-b border-l mask-r-from-40%"
            style={{
              left: `${parentRailX}px`,
              height: "calc(50% + 0.5px)",
              width: `${Math.max(indent - parentRailX - 1, 0)}px`,
            }}
          />
        </>
      ) : null}
      {/* This row's own spine, descending from below its icon to its children. */}
      {showName && node.hasChildren && !node.isCollapsed ? (
        <div
          className="bg-border-contrast absolute bottom-0 w-px mask-t-from-[calc(100%-var(--spacing)*2)]"
          style={{
            left: `${railX}px`,
            top: `calc(50% + ${GUTTER_ICON / 2 + 1}px)`,
          }}
        />
      ) : null}
      {/* The connector rails above deliberately do NOT dim: each row draws only
          its own slice of a shared vertical spine, so per-row opacity would
          turn one continuous line into a dashed one wherever the matches fall.
          The row's IDENTITY — its icon and its name — is what fades. */}
      {showName ? (
        <div
          className={cn(
            "absolute flex items-center gap-1 overflow-hidden",
            dimmed && SEARCH_DIM_OPACITY,
          )}
          style={{
            left: `${indent}px`,
            right: "2px",
            top: `${Math.max((rowHeight - 16) / 2, 0)}px`,
            height: "16px",
          }}
        >
          <span className="shrink-0">
            <ItemTypeIcon type={node.type as LangfuseItemType} size="sm" />
          </span>
          <span
            className="text-foreground truncate"
            style={{ fontSize: "10px" }}
            title={node.name}
          >
            {node.name}
          </span>
        </div>
      ) : (
        <div
          className={cn(
            "absolute rounded-[1px]",
            typeColor,
            dimmed && SEARCH_DIM_OPACITY,
          )}
          data-testid="timeline-dense-type-square"
          style={{
            left: `${indent}px`,
            top: `${Math.max((rowHeight - squareSize) / 2, 0)}px`,
            width: `${squareSize}px`,
            height: `${squareSize}px`,
          }}
        />
      )}
    </div>
  );
}

function hitIdAt(
  nodes: readonly PositionedNode[],
  lane: number,
  xInLane: number,
  packed: boolean,
): string | null {
  let hit: string | null = null;
  for (const node of nodes) {
    if (node.index !== lane) continue;
    if (!packed) return node.id;
    if (node.offscreen) continue;
    if (xInLane >= node.x && xInLane < node.x + Math.max(node.width, 1)) {
      // Later nodes paint above earlier ones, so the last hit is the visible bar.
      hit = node.id;
    }
  }
  return hit;
}

function spanAtPointer(args: {
  rows: readonly { node: { id: string } }[];
  lanes: readonly number[] | null;
  originMs: number;
  compression: {
    toCompressedMs: (ms: number) => number;
  };
  packed: boolean;
  lane: number;
  compressedMs: number;
}): string | null {
  if (!args.packed || !args.lanes) {
    return args.rows[args.lane]?.node.id ?? null;
  }
  let id: string | null = null;
  args.lanes.forEach((lane, index) => {
    if (lane !== args.lane) return;
    const row = args.rows[index];
    if (!row) return;
    const offsets = spanOffsetsOf(row.node as LayoutNode, args.originMs);
    const start = args.compression.toCompressedMs(offsets.startMs);
    const end = args.compression.toCompressedMs(offsets.endMs);
    if (
      args.compressedMs >= start &&
      args.compressedMs <= Math.max(end, start)
    ) {
      id = row.node.id;
    }
  });
  return id;
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  /**
   * A control with nothing to do reads as broken rather than inert — the more so
   * when its icon suggests something dramatic. Say it instead of hiding it: the
   * button is a landmark even when it is spent.
   */
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="hover:bg-muted flex h-4 min-w-4 shrink-0 items-center justify-center gap-0.5 rounded px-0.5 disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}
