/**
 * Throwaway renderer for the extreme-density spike.
 *
 * The question it exists to answer: in a narrow, tall layout, does killing the
 * names and the text and spending every pixel on shape make you FEEL the
 * timeline — where a 26px row with a duration label next to a 4px bar reads as
 * a list of numbers instead?
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
 *    BOTH axes about the cursor, so the time window narrows and the rows grow
 *    together. Zoom is exponential in a zoom level and deltas accumulate per
 *    frame, as in mapping libraries — see the rate constants below.
 *  - Drag pans both axes too, and SHIFT-drag draws a box to zoom into — the one
 *    gesture where the user has stated the window on both axes, so it goes
 *    straight there. There are no scrollbars by design: a map has none, and the
 *    viewport clamps to the content so there is nowhere to get lost.
 *  - Double-click an element focuses it — the time window onto its own extent,
 *    the rows at a height a human reads, the element centred.
 *  - What a row shows follows from how tall it has become: the type square grows
 *    around 10px, text returns around 20px. Zooming in makes the timeline grow
 *    its labels back rather than switching mode.
 *
 * A magnifying lens (rows near the pointer expanding, borrowing space from the
 * rest) is implemented and tested in fns/timeline/focusLens.ts and deliberately
 * NOT wired up: a fisheye needs an invertible transform to hit-test correctly,
 * and absolutely-positioned rows are the wrong substrate. That is the next spike.
 *
 * Not production code.
 */

import { useTheme } from "next-themes";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Maximize2,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react";
import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";
import { cn } from "@/src/utils/tailwind";
import { type Density, type PointerModality } from "../../fns/timeline/density";
import {
  formatDurationMs,
  layout,
  prepareTimeline,
  spanOffsetsOf,
  timeCompressionFor,
  type LayoutNode,
  type PositionedNode,
} from "../../fns/timeline/layout";
import { createTextMeasurer } from "../../fns/timeline/textMeasurer";
import { resolveBarTones } from "../../fns/timeline/barContrast";
import { traceSpaceOf, type Box } from "../../fns/timeline/viewTransform";
import {
  HUMAN_ROW_HEIGHT,
  anchorTimeToRows,
  interpolateViewport,
  rowCountBounds,
  viewportsEqual,
  clampViewport,
  fitViewport,
  focusViewport,
  isViewportFitted,
  panViewport,
  presentationForRowHeight,
  revealViewport,
  rowHeightOf,
  rowIndexAtOffset,
  visibleRowRange,
  zoomToBox,
  zoomViewport,
  type RowExtent,
  type Viewport,
} from "../../fns/timeline/viewport";

/** Reuses ItemBadge's type→hue mapping, so a colour means what it already means. */
const TYPE_COLOR: Record<string, string> = {
  TRACE: "bg-dark-green",
  GENERATION: "bg-muted-magenta",
  EVENT: "bg-muted-green",
  SPAN: "bg-muted-blue",
  AGENT: "bg-purple-600",
  TOOL: "bg-orange-600",
  CHAIN: "bg-pink-600",
  RETRIEVER: "bg-teal-600",
  EMBEDDING: "bg-amber-600",
  GUARDRAIL: "bg-red-600",
};
const FALLBACK_COLOR = "bg-muted-gray";
/** Neutral mode's bar, and the accent a selected or hovered bar takes. */
const NEUTRAL_COLOR = "bg-muted-foreground/60";
const ACCENT_COLOR = "bg-primary-accent";
/** Every colour a bar can be — the set whose contrast has to be resolved. */
const BAR_COLORS = [
  ...Object.values(TYPE_COLOR),
  FALLBACK_COLOR,
  NEUTRAL_COLOR,
  ACCENT_COLOR,
];

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
/** Indent per level once the gutter is open, matching the production gutter. */
const GUTTER_INDENT = 14;
/** The ItemBadge box at `isSmall`, which is square. */
const GUTTER_ICON = 16;
/** A name needs at least this much to be worth indenting away from. */
const GUTTER_NAME_MIN = 48;
/**
 * Where a level's vertical rail sits: under the CENTRE of that level's icon, so
 * the spine reads as descending from the icon that owns it. Hugging the icon's
 * left edge instead left the elbow pointing at nothing in particular.
 */
const GUTTER_RAIL = GUTTER_ICON / 2;
const TOOLBAR_HEIGHT = 22;
const AXIS_HEIGHT = 16;
const READOUT_HEIGHT = 18;
const FRAME_BORDER = 1;
/**
 * Zoom is exponential in a zoom LEVEL — one level doubles the scale — and input
 * deltas accumulate into level deltas, which is how every mapping library does
 * it. The rate has to depend on the input device, and mapping libraries ship two
 * constants for exactly this reason: macOS sends pinch deltas of only a few
 * units while a mouse notch is ~100, so one divisor cannot serve both. A single
 * linear factor per event with a /100 divisor moved ~1% per pinch event, which
 * is why it felt like a lot of touching to get anywhere.
 */
const PINCH_ZOOM_RATE = 1 / 40;
/** A line, for the browsers that report wheel deltas in lines rather than pixels. */
const WHEEL_LINE_PX = 16;
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
/** A collapsed-gap band narrower than this has no room to name itself. */
const GAP_LABEL_MIN_WIDTH = 14;
/** Below this in both axes a shift-drag was a stray click, not a box. */
const MARQUEE_MIN_PX = 6;

type MarqueeBox = {
  from: { x: number; y: number };
  to: { x: number; y: number };
};

export type TimelineDenseProps = {
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
  onSelect: (nodeId: string) => void;
  /** Hover, for prefetching the observation the user is about to open. */
  onHover?: (nodeId: string) => void;
  /**
   * Ids playing at the playhead, glowed while playback runs. A crossing changes
   * the set, so this re-renders on boundaries only — never per frame.
   */
  activeIds?: ReadonlySet<string>;
  /**
   * Extra facts for the hover tooltip, already formatted — cost and token usage
   * live on the app's node, not on the layout contract, and their formatters
   * live with the app. At this density hover is how a row is read at all, so it
   * should say what a tree row says.
   */
  factsOf?: (nodeId: string) => string[];
  /**
   * The trace playhead, handed in rather than read from context: this renderer
   * takes data and nothing implicit, which is what lets Storybook mount it at
   * every size. Absent means there is no playback surface here.
   *
   * `subscribe` is the ~60fps position feed and drives the line imperatively —
   * a playhead that re-rendered 600 rows per frame would be a different kind of
   * broken.
   */
  playhead?: {
    visible: boolean;
    getSec: () => number;
    subscribe: (listener: (sec: number) => void) => () => void;
    /** Click or drag the axis to place it. */
    onSeek: (sec: number) => void;
  };
};

export type GutterMode = "auto" | "expanded" | "collapsed";

export function TimelineDense({
  roots,
  box,
  gutter,
  pointer,
  barColor,
  compress,
  showReadout,
  selectedId,
  onSelect,
  onHover,
  activeIds,
  playhead,
  factsOf,
}: TimelineDenseProps) {
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  /**
   * Shift-drag box, in surface coordinates, while it is being drawn. The REF is
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

  const prepared = useMemo(() => prepareTimeline(roots), [roots]);
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

  // Resolve the VERTICAL window first. It depends only on the row count and the
  // height, never on the width, so row height is known before the gutter width
  // — which is what breaks the cycle (gutter → lane → compression → viewport).
  // Deciding the gutter from the *resting* row height instead left it a rail
  // forever, however far you zoomed in.
  const rowBounds = rowCountBounds({
    rowCount: prepared.rows.length,
    boxHeight: surfaceHeight,
  });
  const liveRowCount = Math.min(
    Math.max(viewport?.rows.count ?? rowBounds.max, rowBounds.min),
    rowBounds.max,
  );
  const liveRowHeight =
    liveRowCount > 0 ? surfaceHeight / liveRowCount : HUMAN_ROW_HEIGHT;

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
  const asked = override === "expanded" || gutterMode === "expanded";
  const wantsOpen =
    override === "collapsed" ? false : asked || gutterMode === "auto";
  const gutterFits =
    contentWidth - wantedGutter >=
    (asked ? MIN_LANE_WIDTH : AUTO_OPEN_MIN_LANE_WIDTH);

  // A COMMITTED open takes real space and re-lays out the chart. A PEEK must
  // not: it floats over the timeline instead, so hovering the edge never shoves
  // the bars sideways while you are reading them.
  const committedOpen = canShowNames && gutterFits && wantsOpen;
  const railWidth = canShowNames
    ? committedOpen
      ? wantedGutter
      : RAIL_WIDTH
    : 0;
  const laneWidth = Math.max(contentWidth - railWidth, 0);

  const chartBox = useMemo(
    () => ({ width: laneWidth, height: surfaceHeight }),
    [laneWidth, surfaceHeight],
  );
  const compression = useMemo(
    () => timeCompressionFor(prepared, chartBox, compress),
    [prepared, chartBox, compress],
  );

  const limits = useMemo(
    () => ({
      traceSpace: traceSpaceOf(compression.compressedDurationMs),
      rowCount: prepared.rows.length,
      boxHeight: surfaceHeight,
    }),
    [compression.compressedDurationMs, prepared.rows.length, surfaceHeight],
  );

  // Re-clamped every render, so a resize can never leave the viewport looking
  // outside the content.
  const current = useMemo(
    () => (viewport ? clampViewport(viewport, limits) : fitViewport(limits)),
    [viewport, limits],
  );
  const rowHeight = rowHeightOf(current, surfaceHeight);
  const isOpen = committedOpen;
  const namesVisible = isOpen;
  // The overlay is not bound by MIN_LANE_WIDTH: it costs the chart no width, so
  // an explicit ask still gets the names where they could not fit beside the
  // chart.
  const peekWidth =
    canShowNames && !committedOpen && (peeking || override === "expanded")
      ? wantedGutter
      : 0;
  const gutterWidth = Math.max(railWidth, peekWidth);
  const presentation = presentationForRowHeight(rowHeight);
  const fitted = isViewportFitted(current, limits);
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
      : rowIndexAtOffset(
          current,
          pointerPos.y,
          rowHeight,
          prepared.rows.length,
        );
  /** Last id we told the caller about, so a prefetch fires once per row. */
  const hoveredRef = useRef<string | null>(null);

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

  const rowRange = visibleRowRange(current, prepared.rows.length);
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
  });

  // What each row occupies on the time axis, in the same compressed space the
  // window is expressed in — so a zoom can tell "nothing to see here" from "the
  // thing you were looking at is still here".
  const extentOf = useCallback(
    (rowIndex: number): RowExtent | null => {
      const row = prepared.rows[rowIndex];
      if (!row) return null;
      const offsets = spanOffsetsOf(row.node, prepared.originMs);
      return {
        startMs: compression.toCompressedMs(offsets.startMs),
        endMs: compression.toCompressedMs(offsets.endMs),
      };
    },
    [prepared, compression],
  );

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const gesture = useRef({ down: false, dragging: false, x: 0, y: 0 });
  const tween = useRef(0);

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
  });
  layoutRef.current = { limits, laneWidth, railWidth, peekWidth, extentOf };

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
    const zoomed = zoomViewport(
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

  const zoomBy = (factor: number, xRatio: number, yRatio: number) => {
    // A gesture takes over from a flight in progress rather than fighting it.
    // Without this the tween's rAF loop kept writing its own interpolated target
    // over the user's zoom for the rest of the 320ms flight — press a zoom button
    // right after a double-click and the button did nothing.
    cancelTween();
    setViewport((from) => zoomAndAnchor(from, { factor, xRatio, yRatio }));
  };

  const panBy = (dxPx: number, dyPx: number) => {
    cancelTween();
    setViewport((from) => {
      const { limits: live, laneWidth: width } = layoutRef.current;
      return panViewport(
        from ? clampViewport(from, live) : fitViewport(live),
        live,
        { dxPx, dyPx, boxWidth: width },
      );
    });
  };

  // Selection is not always ours to place. The tree, a search hit, a deep link
  // and playback all select rows, and a highlight you cannot see is not a
  // highlight — on a trace this dense the chosen row is usually outside the
  // window, and `layout()` does not even emit a node for it. So an EXTERNAL
  // change reveals its row: pan both axes just far enough, never zoom, because
  // "look at this one" is not a request to change how far in you are looking.
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
        rowIndex: index,
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
        tween.current = linear < 1 ? requestAnimationFrame(step) : 0;
      };
      tween.current = requestAnimationFrame(step);
    },
    [cancelTween],
  );

  const scheduleGesture = useCallback(() => {
    // Any gesture on the chart hands the space back: an expanded gutter is for
    // looking, and the moment you work in the chart it gets out of the way. It
    // also takes over from an animation in flight rather than fighting it.
    cancelTween();
    releaseOverride();
    if (pending.current.frame) return;
    pending.current.frame = requestAnimationFrame(flushGesture);
  }, [flushGesture, releaseOverride, cancelTween]);

  /**
   * Wheel and trackpad pinch on a non-passive listener, so the page never takes
   * the gesture. Both zoom, like a map: a Mac pinch arrives as wheel + ctrlKey
   * and needs no special case; shift or a horizontal wheel pans instead.
   */
  const attachSurface = useCallback(
    (element: HTMLDivElement | null) => {
      surfaceRef.current = element;
      if (!element) return;

      const onWheel = (event: WheelEvent) => {
        const rect = element.getBoundingClientRect();
        const queued = pending.current;
        const rail = layoutRef.current.railWidth;
        // Deltas arrive in pixels, lines or pages depending on the browser and
        // the device, so normalize before anything reads them: a line-mode wheel
        // reports 3, and panning 3px per notch reads as stuck.
        const unit =
          event.deltaMode === 1
            ? WHEEL_LINE_PX
            : event.deltaMode === 2
              ? Math.max(rect.height, 1)
              : 1;
        const deltaX = event.deltaX * unit;
        const deltaY = event.deltaY * unit;
        // A macOS pinch is the ONLY wheel event that carries ctrlKey. Holding
        // ⌘/ctrl is the same intent by hand, and it is how you zoom with a mouse.
        const pinch = event.ctrlKey || event.metaKey;

        if (pinch) {
          queued.xRatio =
            rect.width > 0
              ? (event.clientX - rect.left - rail) /
                Math.max(rect.width - rail, 1)
              : 0.5;
          queued.yRatio =
            rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
          queued.levels += -deltaY * PINCH_ZOOM_RATE;
          event.preventDefault();
          scheduleGesture();
          return;
        }

        // EVERY other wheel pans, whatever the device. Sniffing a "mouse notch"
        // out of a big delta and zooming on it was wrong twice over: a fast
        // two-finger flick on a Mac trackpad sends deltas far past any such
        // threshold, so a quick scroll down zoomed OUT to the fitted view and
        // the timeline looked like it kept snapping back to the top — and it
        // swallowed the event either way, so there was no scrolling down at all.
        // Zoom keeps the gestures that say zoom and nothing else: pinch,
        // ⌘/ctrl + wheel, the toolbar buttons, double-click to focus.
        const dxPx = event.shiftKey ? -deltaY : -deltaX;
        const dyPx = event.shiftKey ? 0 : -deltaY;
        const wouldMove = panViewport(
          viewportRef.current,
          layoutRef.current.limits,
          { dxPx, dyPx, boxWidth: layoutRef.current.laneWidth },
        );
        // Only swallow the gesture if it actually moves us; at a clamp the page
        // keeps its scroll instead of being trapped.
        if (viewportsEqual(wouldMove, viewportRef.current)) return;
        event.preventDefault();
        queued.dxPx += dxPx;
        queued.dyPx += dyPx;
        scheduleGesture();
      };

      element.addEventListener("wheel", onWheel, { passive: false });
      return () => {
        cancelTween();
        element.removeEventListener("wheel", onWheel);
      };
    },
    // Stable: everything live is read from layoutRef, so the listener attaches
    // once and an animation is never cancelled by a re-attach.
    [scheduleGesture, cancelTween],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Touch has no hover, so a tap on the rail is the toggle.
    const offsetX =
      event.clientX - event.currentTarget.getBoundingClientRect().left;
    if (
      (pointer === "coarse" || event.pointerType === "touch") &&
      offsetX <= Math.max(railWidth, peekWidth) + PEEK_MARGIN_PX
    ) {
      setOverride(isOpen ? "collapsed" : "expanded");
      return;
    }
    // Shift+drag draws a box to zoom into, which is the one gesture where the
    // user states the window on BOTH axes — so it goes straight there rather
    // than picking a level for them. Plain drag keeps panning; a map's primary
    // gesture should not need a modifier.
    if (event.shiftKey) {
      const rect = event.currentTarget.getBoundingClientRect();
      const point = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setMarqueeBox({ from: point, to: point });
      return;
    }

    gesture.current = {
      down: true,
      dragging: false,
      x: event.clientX,
      y: event.clientY,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
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

    const index = rowIndexAtOffset(
      current,
      offsetY,
      rowHeight,
      prepared.rows.length,
    );
    const hoveredId = index == null ? null : prepared.rows[index]?.node.id;
    if (hoveredId && hoveredId !== hoveredRef.current) {
      hoveredRef.current = hoveredId;
      onHover?.(hoveredId);
    }
    setPointerPos({ x: offsetX, y: offsetY });
  };

  /** Release of a shift-drag: fly to the box, if it is big enough to mean one. */
  const commitMarquee = () => {
    const box = marqueeRef.current;
    if (!box) return;
    setMarqueeBox(null);
    const width = Math.abs(box.to.x - box.from.x);
    const height = Math.abs(box.to.y - box.from.y);
    // A stray shift-click is not a zoom to a pinhole.
    if (width < MARQUEE_MIN_PX && height < MARQUEE_MIN_PX) return;
    const lane = Math.max(laneWidth, 1);
    const tall = Math.max(surfaceHeight, 1);
    flyTo(
      zoomToBox(current, limits, {
        xStartRatio: (box.from.x - railWidth) / lane,
        xEndRatio: (box.to.x - railWidth) / lane,
        yStartRatio: box.from.y / tall,
        yEndRatio: box.to.y / tall,
      }),
    );
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

  /** Double-click an element: both axes move to put it on screen, readably. */
  const focusRow = (index: number) => {
    const positioned = result.nodes.find((node) => node.index === index);
    const row = prepared.rows[index];
    if (!positioned || !row) return;
    // The click that opened this double-click already selected the row, and this
    // flight is about to put it exactly where it should be — so the reveal below
    // must not also chase it and cancel the animation.
    revealedRef.current = row.node.id;
    const startMs = compression.toCompressedMs(positioned.startMs);
    flyTo(
      focusViewport(limits, {
        rowIndex: index,
        startMs,
        durationMs: compression.toCompressedMs(positioned.endMs) - startMs,
      }),
    );
  };

  const focused =
    focusIndex == null
      ? null
      : (result.nodes.find((node) => node.index === focusIndex) ?? null);
  // Seconds from the trace origin ↔ px in the lane, through the same
  // compression and window the bars went through — so the playhead cannot
  // disagree with what it is sweeping over.
  const secToX = (sec: number) =>
    (compression.toCompressedMs(Math.max(sec, 0) * 1000) - current.time.start) *
    result.pxPerMs;
  const xToSec = (px: number) =>
    result.pxPerMs > 0
      ? compression.toRealMs(current.time.start + px / result.pxPerMs) / 1000
      : 0;
  // The imperative feed reads the live mapping, so a pan or a zoom mid-playback
  // moves the line to the right place on its next tick rather than drifting.
  const mappingRef = useRef(secToX);
  mappingRef.current = secToX;

  const subscribePlayhead = playhead?.subscribe;
  const getPlayheadSec = playhead?.getSec;
  const attachPlayhead = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element || !subscribePlayhead || !getPlayheadSec) return;
      const apply = (sec: number) => {
        element.style.transform = `translateX(${mappingRef.current(sec)}px)`;
      };
      apply(getPlayheadSec());
      return subscribePlayhead(apply);
    },
    [subscribePlayhead, getPlayheadSec],
  );

  const onSeek = playhead?.onSeek;
  const seekFromEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onSeek(xToSec(event.clientX - rect.left - railWidth));
  };
  const onAxisPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    // Press to place it, drag to scrub — one gesture, as on the wide timeline.
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromEvent(event);
  };
  const onAxisPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onSeek || !event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    seekFromEvent(event);
  };

  const windowLabel = formatDurationMs(
    compression.toRealMs(current.time.start + current.time.duration) -
      compression.toRealMs(current.time.start),
  );

  return (
    <div
      className="bg-background border-border text-foreground flex flex-col overflow-hidden rounded border select-none"
      style={{ width: `${box.width}px`, height: `${box.height}px` }}
    >
      <div
        className="border-border flex shrink-0 items-center gap-1 border-b px-1"
        style={{ height: `${TOOLBAR_HEIGHT}px` }}
      >
        <ToolbarButton
          label="Zoom out"
          onClick={() => zoomBy(2 ** -BUTTON_ZOOM_LEVELS, 0.5, 0.5)}
        >
          <Minus className="h-3 w-3" />
        </ToolbarButton>
        <ToolbarButton
          label="Zoom in"
          onClick={() => zoomBy(2 ** BUTTON_ZOOM_LEVELS, 0.5, 0.5)}
        >
          <Plus className="h-3 w-3" />
        </ToolbarButton>
        <ToolbarButton
          label="Fit whole trace"
          onClick={() => flyTo(fitViewport(limits))}
        >
          <Maximize2 className="h-3 w-3" />
        </ToolbarButton>
        {/* Hidden when there is nothing to expand: a control that cannot do
            anything is worse than no control. */}
        {canShowNames ? (
          <ToolbarButton
            label={isOpen ? "Collapse names" : "Show names"}
            onClick={() => setOverride(isOpen ? "collapsed" : "expanded")}
          >
            {isOpen ? (
              <PanelLeftClose className="h-3 w-3" />
            ) : (
              <PanelLeftOpen className="h-3 w-3" />
            )}
          </ToolbarButton>
        ) : null}
        <span
          className="text-muted-foreground truncate"
          style={{ fontSize: "10px" }}
          title={
            fitted
              ? "scroll to pan · pinch to zoom · shift-drag a box · double-click to focus"
              : `${rowHeight.toFixed(1)}px rows · ${windowLabel} window`
          }
        >
          {fitted
            ? "scroll to pan · pinch to zoom · shift-drag a box · double-click to focus"
            : `${rowHeight.toFixed(1)}px rows · ${windowLabel} window`}
        </span>
      </div>

      {/* The axis doubles as the scrub track: press to place the playhead, drag
          to move it — the same gesture the wide timeline's scale has. */}
      <div
        className={cn(
          "border-border relative shrink-0 border-b",
          onSeek && "cursor-ew-resize",
        )}
        style={{ height: `${AXIS_HEIGHT}px`, touchAction: "none" }}
        onPointerDown={onAxisPointerDown}
        onPointerMove={onAxisPointerMove}
        data-testid="timeline-dense-axis"
      >
        {/* Font probe for the measurer: a label's own size, invisible and out of
            flow so it costs no layout. */}
        <span
          ref={labelProbeRef}
          aria-hidden
          className="invisible absolute"
          style={{ fontSize: "10px" }}
        >
          0
        </span>
        <div
          className="absolute inset-y-0 overflow-hidden"
          style={{ left: `${railWidth}px`, width: `${laneWidth}px` }}
        >
          {result.ticks.map((tick) => (
            <div
              key={tick.realMs}
              className="border-border-contrast absolute inset-y-0 border-l"
              style={{ left: `${tick.x}px` }}
            >
              <span
                className="text-muted-foreground absolute left-1 whitespace-nowrap"
                style={{ fontSize: "9px" }}
              >
                {tick.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* The map surface. No scrollbars: panning is the gesture, and the
          viewport clamps to the content so there is nowhere to get lost. */}
      <div
        ref={attachSurface}
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => {
          commitMarquee();
          endGesture();
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        }}
        onPointerLeave={clearFocus}
        onPointerCancel={() => {
          setMarqueeBox(null);
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
            {result.gaps.map((gap) => (
              <div
                key={`${gap.x}-${gap.durationMs}`}
                className="bg-muted border-border-contrast absolute inset-y-0 flex items-center justify-center overflow-hidden border-x border-dashed"
                style={{ left: `${gap.x}px`, width: `${gap.width}px` }}
              >
                {gap.width >= GAP_LABEL_MIN_WIDTH ? (
                  <span
                    className="text-muted-foreground rotate-90 whitespace-nowrap"
                    style={{ fontSize: "9px" }}
                  >
                    {gap.label} idle
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          {result.nodes.map((node) => {
            const y = (node.index - current.rows.start) * rowHeight;
            if (y + rowHeight < 0 || y > surfaceHeight) return null;

            const isFocused = node.index === focusIndex;
            const isSelected = node.id === selectedId;
            const isActive = activeIds?.has(node.id) ?? false;
            const typeColor = TYPE_COLOR[node.type] ?? FALLBACK_COLOR;
            // One place decides the bar's colour, so the label can ask about the
            // exact class the bar got rather than guessing at it.
            const barClass =
              isFocused || isSelected
                ? ACCENT_COLOR
                : barColor === "type"
                  ? typeColor
                  : NEUTRAL_COLOR;

            return (
              <div
                key={node.id}
                className={cn(
                  "absolute inset-x-0",
                  // At 4px a tint is not enough to find yourself by, so the
                  // hovered row takes a full-width accent wash.
                  isSelected && "bg-primary-accent/20",
                  isFocused && !isSelected && "bg-primary-accent/15",
                  // Playing rows glow up rather than others dimming down, which
                  // is the standing rule for playback highlight.
                  isActive && !isSelected && !isFocused && "bg-primary/20",
                )}
                style={{ top: `${y}px`, height: `${rowHeight}px` }}
                // A double-click delivers TWO clicks, and selecting is not free:
                // it captures an analytics event and reopens the detail panel.
                // The first click of the pair already selected the row, so the
                // second one only focuses.
                onClick={(event) => {
                  if (event.detail > 1) return;
                  onSelect(node.id);
                }}
                onDoubleClick={() => focusRow(node.index)}
              >
                <GutterContent
                  node={node}
                  width={railWidth}
                  rowHeight={rowHeight}
                  barHeight={barHeight}
                  showName={namesVisible}
                />

                <div
                  className="absolute inset-y-0 overflow-hidden"
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
                      className={cn("absolute rounded-[1px]", barClass)}
                      style={{
                        left: `${node.x}px`,
                        width: `${node.width}px`,
                        top: `${Math.max((rowHeight - barHeight) / 2, 0)}px`,
                        height: `${barHeight}px`,
                      }}
                      data-testid="timeline-dense-bar"
                    />
                  )}
                  {/* Text comes back on its own as the rows grow — and it goes
                      on whichever side layout() measured room for, rather than
                      always after the bar, which clipped a full-width bar's
                      label at the lane edge. */}
                  {presentation === "labelled" &&
                  node.label &&
                  !node.offscreen &&
                  node.labelPlacement !== "hidden" ? (
                    <span
                      className={cn(
                        "absolute overflow-hidden whitespace-nowrap",
                        // A label drawn ON the bar contrasts with the BAR, not
                        // with the page, so it takes white or black from that
                        // bar's own luminance — see fns/timeline/barContrast.ts.
                        // A chip of page-coloured ground read as a hole punched
                        // in the bar; this reads as a label on it.
                        node.labelPlacement !== "inside"
                          ? "text-muted-foreground"
                          : barTones[barClass] === "dark"
                            ? "text-black/85"
                            : "text-white/95",
                      )}
                      data-testid="timeline-dense-duration"
                      data-placement={node.labelPlacement}
                      style={{
                        // A `before` label is anchored by its RIGHT edge, so its
                        // gap from the bar is exact no matter what the measurer
                        // thought the text was worth. Positioning it from the
                        // left needs `left = x - gap - measuredWidth`, and any
                        // under-measure is subtracted straight out of the gap:
                        // measured 6px narrow and the label sat flush against
                        // the bar. `after` never had the bug — it grows away
                        // from its anchor rather than toward it.
                        ...(node.labelPlacement === "before"
                          ? {
                              right: `${Math.max(laneWidth - node.labelX - node.labelWidth, 0)}px`,
                              maxWidth: `${Math.max(node.labelX + node.labelWidth, 0)}px`,
                            }
                          : {
                              left: `${node.labelX}px`,
                              maxWidth: `${Math.max(laneWidth - node.labelX, 0)}px`,
                            }),
                        top: `${Math.max((rowHeight - 12) / 2, 0)}px`,
                        fontSize: "10px",
                      }}
                    >
                      {node.label}
                    </span>
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

          {/* The playhead sweeps in the lane, clipped by it, and is positioned
              imperatively off the position feed — 600 rows must not re-render to
              move a 2px line. */}
          {playhead?.visible ? (
            <div
              className="pointer-events-none absolute inset-y-0 overflow-hidden"
              style={{ left: `${railWidth}px`, width: `${laneWidth}px` }}
            >
              <div
                ref={attachPlayhead}
                className="bg-primary absolute inset-y-0 w-0.5"
                style={{
                  transform: `translateX(${secToX(playhead.getSec())}px)`,
                }}
                data-testid="timeline-dense-playhead"
              />
            </div>
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
              if (y + rowHeight < 0 || y > surfaceHeight) return null;
              return (
                <div
                  key={node.id}
                  className={cn(
                    "absolute inset-x-0",
                    node.id === selectedId && "bg-primary-accent/20",
                    node.index === focusIndex &&
                      node.id !== selectedId &&
                      "bg-primary-accent/15",
                  )}
                  style={{ top: `${y}px`, height: `${rowHeight}px` }}
                >
                  <GutterContent
                    node={node}
                    width={peekWidth}
                    rowHeight={rowHeight}
                    barHeight={barHeight}
                    showName
                  />
                </div>
              );
            })}
          </div>
        ) : null}

        {/* The tooltip is what names a row when the gutter cannot. */}
        {focused && pointerPos && !dragging && pointerPos.x > gutterWidth ? (
          <div
            className="border-border bg-background text-foreground pointer-events-none absolute z-10 flex flex-col gap-0.5 overflow-hidden rounded border px-1.5 py-1 shadow-md"
            style={{
              left:
                pointerPos.x > contentWidth * 0.55
                  ? undefined
                  : `${Math.round(pointerPos.x + 12)}px`,
              right:
                pointerPos.x > contentWidth * 0.55
                  ? `${Math.round(Math.max(contentWidth - pointerPos.x + 12, 4))}px`
                  : undefined,
              // Clamped to the space left, not a percentage guess: an unclamped
              // tooltip poked past the surface and put 5px of scrollWidth on a
              // box whose whole claim is that nothing scrolls.
              maxWidth: `${Math.max(
                pointerPos.x > contentWidth * 0.55
                  ? pointerPos.x - 16
                  : contentWidth - pointerPos.x - 16,
                80,
              )}px`,
              top: `${Math.round(
                Math.min(
                  Math.max(pointerPos.y + 12, 2),
                  Math.max(surfaceHeight - 26, 2),
                ),
              )}px`,
              fontSize: "10px",
            }}
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
            </span>
            <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span>
                {focused.durationMs == null
                  ? "—"
                  : formatDurationMs(focused.durationMs)}
              </span>
              <span>@{formatDurationMs(focused.startMs)}</span>
              {factsOf?.(focused.id).map((fact) => (
                <span key={fact}>{fact}</span>
              ))}
            </span>
          </div>
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
            {(current.rows.start + current.rows.count).toFixed(1)} of{" "}
            {prepared.rows.length}
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
function GutterContent({
  node,
  width,
  rowHeight,
  barHeight,
  showName,
}: {
  node: PositionedNode;
  width: number;
  rowHeight: number;
  barHeight: number;
  showName: boolean;
}) {
  // Nothing to show, so nothing to build: at bird's-eye density the rail has no
  // width, and a box of invisible squares is one DOM node per row of the trace.
  if (width <= 0) return null;

  // RAIL_MAX_DEPTH exists to keep a tiny square inside a 15px rail, and applying
  // it to the OPEN gutter flattened the tree: every node past depth 4 drew at the
  // same indent and the same connector column in a gutter up to 168px wide. The
  // open gutter caps on the width it actually has instead — deep traces still
  // need a cap (a 1401-deep chain would push every name out of the box), but it
  // is the one the gutter can afford, leaving room for the icon and a name.
  const depth = showName
    ? Math.min(
        node.depth,
        Math.max(
          Math.floor((width - GUTTER_ICON - GUTTER_NAME_MIN) / GUTTER_INDENT),
          0,
        ),
      )
    : Math.min(node.depth, RAIL_MAX_DEPTH);
  const typeColor = TYPE_COLOR[node.type] ?? FALLBACK_COLOR;
  // The square must end up INSIDE the rail, so its size and its indent are both
  // bounded by the width it has to live in — not by the row height alone.
  const squareSize = Math.max(
    Math.min(barHeight, RAIL_SQUARE_MAX, width - RAIL_INDENT),
    2,
  );
  const indent = showName
    ? depth * GUTTER_INDENT
    : Math.min(depth * RAIL_INDENT + 1, Math.max(width - squareSize - 1, 0));
  /** x of this row's own rail, and of its parent's. */
  const railX = depth * GUTTER_INDENT + GUTTER_RAIL;
  const parentRailX = (depth - 1) * GUTTER_INDENT + GUTTER_RAIL;

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
          <div
            className={cn(
              "bg-border-contrast absolute top-0 w-px",
              node.isLastSibling ? "h-1/2" : "bottom-0",
            )}
            style={{ left: `${parentRailX}px` }}
          />
          <div
            className="bg-border-contrast absolute top-1/2 h-px"
            style={{
              left: `${parentRailX}px`,
              width: `${Math.max(indent - parentRailX, 0)}px`,
            }}
          />
        </>
      ) : null}
      {/* This row's own spine, descending from its icon to its children. */}
      {showName && node.hasChildren && !node.isCollapsed ? (
        <div
          className="bg-border-contrast absolute top-1/2 bottom-0 w-px"
          style={{ left: `${railX}px` }}
        />
      ) : null}
      {showName ? (
        <div
          className="absolute flex items-center gap-1 overflow-hidden"
          style={{
            left: `${indent}px`,
            right: "2px",
            top: `${Math.max((rowHeight - 16) / 2, 0)}px`,
            height: "16px",
          }}
        >
          <span className="shrink-0">
            <ItemBadge type={node.type as LangfuseItemType} isSmall />
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
          className={cn("absolute rounded-[1px]", typeColor)}
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

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="hover:bg-muted flex h-4 w-4 shrink-0 items-center justify-center rounded"
    >
      {children}
    </button>
  );
}
