import { useState } from "react";
import { expect, fn, userEvent, waitFor } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { TimelineDense, type TimelineDenseProps } from "./TimelineDense";
import {
  deepNesting,
  streamingSpan,
  manySpans,
  reporterTrace,
  threeSpans,
  longTailTrace,
} from "../../fns/timeline/__tests__/timelineV2.fixtures";

const meta = preview.meta({
  component: TimelineDense,
});

/**
 * A phone-shaped box: narrow and tall, which is the case this spike is for.
 * 658px leaves exactly 600px of surface once the frame, toolbar, axis and
 * readout are taken — room for 600 rows at the 1px floor, so the "at the floor"
 * story really is at the floor.
 */
const PHONE = { width: 360, height: 658 };
/** The peek panel: narrow and short. */
const PEEK = { width: 320, height: 300 };
/**
 * A full-width desktop pane. Every other box here is narrow, which is the case
 * the spike was written for — but the same layout has to hold when the lane is
 * ten times wider, and that is a different question: whether extreme density is
 * still the right answer when there is plenty of room.
 */
const DESKTOP = { width: 1280, height: 658 };

export const FiftySpansOnAPhone = meta.story({
  args: {
    roots: manySpans(50),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "neutral",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
});

/** Mid density: 4px a row, the bars still clearly individual things. */
export const OneHundredFiftySpansOnAPhone = meta.story({
  args: {
    roots: manySpans(150),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "neutral",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
});

/**
 * Exactly at the floor: 600 spans, one device pixel each, the whole trace on
 * screen with nothing to scroll to. This is the case that argued the floor down
 * from 4px — at 4px this trace was a window onto a quarter of itself.
 */
export const SixHundredSpansAtTheOnePixelFloor = meta.story({
  args: {
    roots: manySpans(600),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
});

/** Past even the 1px floor: the extra rows are panned to, maps-style. */
export const ThreeThousandSpansPannable = meta.story({
  args: {
    roots: manySpans(3000),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
});

export const TypeColouredBars = meta.story({
  args: {
    roots: manySpans(150),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
});

/** Few enough rows that they stay comfortable and keep their text. */
export const ShortTraceStaysReadable = meta.story({
  args: {
    roots: threeSpans(),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "neutral",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
});

export const ReporterShapeInAPeek = meta.story({
  args: {
    roots: reporterTrace(),
    box: PEEK,
    gutter: "auto",
    pointer: "fine",
    barColor: "neutral",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
});

/** The gutter forced open: what the left side becomes when there is room. */
export const NamesExpanded = meta.story({
  args: {
    roots: manySpans(150),
    box: PHONE,
    gutter: "expanded",
    pointer: "fine",
    barColor: "neutral",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
});

export const FullWidthDesktop = meta.story({
  args: {
    roots: manySpans(150),
    box: DESKTOP,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
});

/**
 * Full width with the gutter open. Few enough rows that they are readable, which
 * is what the gutter needs — 150 rows in this box are 4px, and a name in a 4px
 * row is not a name, so the gutter would refuse to open at all.
 */
export const FullWidthWithNames = meta.story({
  args: {
    roots: manySpans(24),
    box: DESKTOP,
    gutter: "expanded",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
});

/** Full width, past the row floor: 500 spans with 150 on screen. */
export const FullWidthManySpans = meta.story({
  args: {
    roots: manySpans(500),
    box: DESKTOP,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
});

/** Touch: no hover, so the rail toggles on tap. */
export const TouchTapToToggle = meta.story({
  args: {
    roots: manySpans(150),
    box: PHONE,
    gutter: "auto",
    pointer: "coarse",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
});

export const LongTailCompressed = meta.story({
  args: {
    roots: longTailTrace(),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: true,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
});

export const NeitherAxisScrolls = meta.story({
  name: "(Test) Neither Axis Scrolls",
  args: {
    roots: manySpans(150),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "neutral",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");

    // The whole claim of this spike: nothing scrolls in either axis. The surface
    // is a map — it pans — so there must be no scrollable overflow at all.
    await expect(surface.scrollWidth).toBeLessThanOrEqual(surface.clientWidth);
    await expect(surface.scrollHeight).toBeLessThanOrEqual(
      surface.clientHeight,
    );

    const bars = canvasElement.querySelectorAll<HTMLElement>(
      '[data-testid="timeline-dense-bar"]',
    );
    await expect(bars.length).toBe(150);

    const surfaceRect = surface.getBoundingClientRect();
    for (const bar of bars) {
      const rect = bar.getBoundingClientRect();
      await expect(rect.right).toBeLessThanOrEqual(surfaceRect.right + 0.5);
      await expect(rect.top).toBeGreaterThanOrEqual(surfaceRect.top - 0.5);
      await expect(rect.bottom).toBeLessThanOrEqual(surfaceRect.bottom + 0.5);
      await expect(rect.height).toBeGreaterThan(0);
    }
  },
});

export const ScrollPansPinchZooms = meta.story({
  name: "(Test) Scroll Pans, Pinch Zooms",
  args: {
    roots: manySpans(150),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "neutral",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    const rowHeight = () =>
      canvasElement.querySelector<HTMLElement>(
        '[data-testid="dense-rowheight"]',
      )?.textContent ?? "";
    const rowWindow = () =>
      canvasElement.querySelector<HTMLElement>('[data-testid="dense-rows"]')
        ?.textContent ?? "";

    const rect = surface.getBoundingClientRect();
    const wheel = (init: WheelEventInit) =>
      surface.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          ...init,
        }),
      );

    // Zoom in a little first, so there is somewhere to pan to AND headroom
    // left below the max row height for the last assertion.
    wheel({ deltaY: -40, ctrlKey: true });
    await waitFor(() => expect(rowHeight()).not.toContain("4.0px"));
    const heightBefore = rowHeight();
    const windowBefore = rowWindow();

    // A macOS two-finger scroll is a PLAIN wheel. It must pan, never zoom —
    // this is the whole bug: treating it as zoom made scrolling around resize
    // the rows.
    wheel({ deltaY: 30 });
    await waitFor(() => expect(rowWindow()).not.toBe(windowBefore));
    await expect(rowHeight()).toBe(heightBefore);

    // And a FAST flick is the same gesture. A trackpad sends deltas of well over
    // 100 when you flick, and classifying those as a discrete mouse notch made
    // them zoom out to the fitted view instead: scrolling down snapped the
    // timeline back to the top and kept it there.
    const windowAfterSlow = rowWindow();
    wheel({ deltaY: 240 });
    await waitFor(() => expect(rowWindow()).not.toBe(windowAfterSlow));
    await expect(rowHeight()).toBe(heightBefore);
    // Line-mode deltas (Firefox, classic wheels) pan too, and by a usable amount.
    const windowAfterFlick = rowWindow();
    wheel({ deltaY: 3, deltaMode: 1 });
    await waitFor(() => expect(rowWindow()).not.toBe(windowAfterFlick));
    await expect(rowHeight()).toBe(heightBefore);

    // A pinch carries ctrlKey, and that zooms.
    wheel({ deltaY: -40, ctrlKey: true });
    await waitFor(() => expect(rowHeight()).not.toBe(heightBefore));
  },
});

/**
 * Relative luminance of ANY css colour, via a painted pixel. Parsing the computed
 * string would not do: Chrome returns `oklch(...)` verbatim for the tokens
 * authored in it, and reading those numbers as R, G, B turns a mid-tone into
 * near-black — which is exactly the bug this test exists to catch.
 *
 * Deliberately NOT `luminanceOf` from `barContrast.ts`, which is the function the
 * component picks its tone with. A test that measures with the same function the
 * subject decides with cannot see that function being wrong: both sides would
 * move together and an unreadable label would pass. Keep this arm's length —
 * these are two implementations of a fixed published formula, on purpose.
 */
const luminance = (colour: string) => {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) throw new Error("no 2d context to measure a colour with");
  context.fillStyle = colour;
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

export const LabelsStayReadableOnBars = meta.story({
  name: "(Test) Labels Stay Readable On Bars",
  args: {
    roots: threeSpans(),
    box: DESKTOP,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const labels = [
      ...canvasElement.querySelectorAll<HTMLElement>(
        '[data-testid="timeline-dense-duration"][data-placement="inside"]',
      ),
    ];
    // A wide box makes the bars wide enough to hold their own labels, which is
    // the case that has to be legible: the type palette runs from pastels to
    // 600s, so no single text colour works on all of it.
    await expect(labels.length).toBeGreaterThan(0);

    for (const label of labels) {
      // The label draws straight on the bar — no chip of page-coloured ground,
      // which read as a hole punched in the bar.
      await expect(getComputedStyle(label).backgroundColor).toMatch(
        /rgba\(0, 0, 0, 0\)|transparent/,
      );

      // And its colour is the one that contrasts with THIS bar: the bar is the
      // label's own row, so ask that bar what colour it resolved to.
      // From the ROW, not the label's parent: the label lives in the metric
      // cluster now, and the bar is its sibling rather than its uncle.
      const bar = label
        .closest('[data-testid="timeline-dense-row"]')
        ?.querySelector<HTMLElement>('[data-testid="timeline-dense-bar"]');
      if (!bar) throw new Error("a label with no bar to sit on");
      const barLuminance = luminance(getComputedStyle(bar).backgroundColor);
      const textLuminance = luminance(getComputedStyle(label).color);
      // Light bar → dark text, dark bar → light text. Either way the two must
      // land on opposite sides of the crossover.
      if (barLuminance > 0.179) {
        await expect(textLuminance).toBeLessThan(barLuminance);
      } else {
        await expect(textLuminance).toBeGreaterThan(barLuminance);
      }
    }
  },
});

export const LabelsKeepTheirDistance = meta.story({
  name: "(Test) Labels Keep Their Distance",
  args: {
    // A long tail puts its real work hard against the right edge, which is the
    // only way a duration label ends up on the LEFT of its bar.
    roots: longTailTrace(),
    box: DESKTOP,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const labels = [
      ...canvasElement.querySelectorAll<HTMLElement>(
        '[data-testid="timeline-dense-duration"]',
      ),
    ].filter((label) => label.dataset.placement !== "inside");
    await expect(labels.length).toBeGreaterThan(0);

    let sawBefore = false;
    for (const label of labels) {
      const bar = label
        .closest('[data-testid="timeline-dense-row"]')
        ?.querySelector<HTMLElement>('[data-testid="timeline-dense-bar"]');
      if (!bar) continue;
      const l = label.getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      const before = label.dataset.placement === "before";
      sawBefore = sawBefore || before;
      // The SAME gap on either side. A `before` label positioned from its left
      // edge (`x - gap - measuredWidth`) spends any under-measure out of the gap
      // and ends up flush against the bar; anchored by its right edge it cannot.
      const gap = before ? b.left - l.right : l.left - b.right;
      await expect(gap).toBeCloseTo(6, 0);
    }
    // The fixture has to actually exercise the left side, or this guards nothing.
    await expect(sawBefore).toBe(true);
  },
});

export const TooltipShowsTheCost = meta.story({
  name: "(Test) Tooltip Shows The Cost",
  args: {
    roots: manySpans(40),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
    metricsOf: () => ({ costText: "$0.006425" }),
  },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    const rect = surface.getBoundingClientRect();
    surface.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerType: "mouse",
        clientX: rect.left + rect.width * 0.7,
        clientY: rect.top + rect.height * 0.4,
      }),
    );

    // `document`, not `canvasElement`: the tooltip renders in the tooltip layer,
    // which is a body-level sibling of the app root.
    const tooltip = () =>
      document.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-tooltip"]',
      );
    await waitFor(() => expect(tooltip()).not.toBeNull());
    const box = tooltip()!;

    // At this density hover IS how a row is read, so it says what a tree row
    // says: identity, then the metrics.
    await expect(box.innerText).toContain("$0.006425");
    // And the NAME survives the extra facts. One flex row made the name the only
    // flexible item, so cost and tokens truncated it to nothing — the one thing
    // the hover was for.
    const name = box.querySelector<HTMLElement>("span[title]");
    if (!name) throw new Error("no name in the tooltip");
    await expect(name.getBoundingClientRect().width).toBeGreaterThan(20);
    await expect(name.innerText.length).toBeGreaterThan(0);

    // Still nothing to scroll: the tooltip is clamped to the space it has.
    await expect(surface.scrollWidth).toBeLessThanOrEqual(surface.clientWidth);
    await expect(surface.scrollHeight).toBeLessThanOrEqual(
      surface.clientHeight,
    );
  },
});

export const ZoomLandsOnContent = meta.story({
  name: "(Test) Zoom Lands On Content",
  args: {
    // A long tail: the spans are all in a sliver of the wall clock, so zooming
    // the middle of the box is exactly where the two axes come apart.
    roots: longTailTrace(),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    const bars = () =>
      canvasElement.querySelectorAll('[data-testid="timeline-dense-bar"]')
        .length;
    const readout = () =>
      canvasElement.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-readout"]',
      )?.textContent ?? "";

    await expect(bars()).toBeGreaterThan(0);
    const rect = surface.getBoundingClientRect();
    // Zoom hard, about the middle of the box — the point most likely to be empty.
    for (let step = 0; step < 6; step++) {
      surface.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY: -40,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }),
      );
    }
    await waitFor(() => expect(readout()).toContain("zoomed"));

    // Zooming in must never end up looking at nothing. The rows and the clock are
    // only correlated, so the window follows the rows when they part company.
    await expect(bars()).toBeGreaterThan(0);
  },
});

export const HoverPeeksTheNames = meta.story({
  name: "(Test) Hover Peeks The Names",
  args: {
    roots: manySpans(40),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    // Names live in the peek overlay OR in the in-flow gutter, depending on
    // whether the open is a peek or a committed one.
    const names = () =>
      canvasElement.querySelectorAll(
        '[data-testid="timeline-dense-peek"] span[title], [data-testid="timeline-dense-content"] > div span[title]',
      ).length;
    const rect = surface.getBoundingClientRect();
    const move = (offsetX: number) =>
      surface.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerType: "mouse",
          clientX: rect.left + offsetX,
          clientY: rect.top + 120,
        }),
      );

    const barGeometry = () => {
      const bar = canvasElement.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-bar"]',
      );
      if (!bar) return null;
      const box = bar.getBoundingClientRect();
      return `${Math.round(box.left)}:${Math.round(box.width)}`;
    };

    // 40 rows in this box are 15px — readable, but below where the gutter opens
    // on its own. Hovering the rail is what peeks at the names.
    await expect(names()).toBe(0);
    const beforePeek = barGeometry();
    move(4);
    await waitFor(() => expect(names()).toBeGreaterThan(0));

    // The peek floats OVER the timeline. It must not take width from the lane,
    // because re-laying out the bars while you look at them moves the very thing
    // you are trying to read.
    await expect(barGeometry()).toBe(beforePeek);

    // Moving into the chart hands the space straight back.
    move(rect.width * 0.7);
    await waitFor(() => expect(names()).toBe(0));
    await expect(barGeometry()).toBe(beforePeek);
  },
});

export const DoubleClickFocusesBothAxes = meta.story({
  name: "(Test) Double Click Focuses Both Axes",
  args: {
    roots: manySpans(150),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "neutral",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const readout = () =>
      canvasElement.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-readout"]',
      )?.textContent ?? "";

    await expect(readout()).toContain("fitted");
    await expect(readout()).toContain("4.0px rows");

    const row = canvasElement.querySelectorAll<HTMLElement>(
      '[data-testid="timeline-dense-content"] > div',
    )[40];
    if (!row) throw new Error("expected a row to double-click");
    row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

    // Both axes move: the rows reach a readable height AND the time window
    // narrows onto the element, rather than only zooming the clock. The focus
    // FLIES rather than jumping, so this is the landing, not the first frame.
    await waitFor(() => expect(readout()).toContain("zoomed"));
    await waitFor(() => expect(readout()).toContain("26.0px rows"));
    await expect(readout()).not.toContain("rows 0.0–150.0 of 150");
  },
});

/** Pre-order DFS, the order `prepareTimeline` flattens rows in. */
const lastRowId = (roots: ReturnType<typeof manySpans>): string => {
  let last = "";
  const stack = [...roots].reverse();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) break;
    last = node.id;
    stack.push(...[...node.children].reverse());
  }
  return last;
};

const DEEP_TRACE = manySpans(3000);

export const ExternalSelectionIsRevealed = meta.story({
  name: "(Test) External Selection Is Revealed",
  args: {
    roots: DEEP_TRACE,
    // The tree, a search hit or a deep link can select any row at all — here the
    // very last one, thousands of rows below the window this box can hold.
    selectedId: lastRowId(DEEP_TRACE),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const rows = () =>
      canvasElement.querySelector<HTMLElement>('[data-testid="dense-rows"]')
        ?.textContent ?? "";

    // A highlight you cannot see is not a highlight: the window has to come to
    // the selection, all the way down at row 2999 of 3000.
    await waitFor(() => expect(rows()).toContain("of 3000"));
    const window = /rows ([\d.]+)[–-]([\d.]+)/.exec(rows());
    if (!window) throw new Error(`no row window in "${rows()}"`);
    await expect(Number(window[1])).toBeGreaterThan(2_000);
    // Revealed by PANNING: 600 rows of window before and after, because bringing
    // a row into view is not a request to change how far in you are looking.
    await expect(Number(window[2]) - Number(window[1])).toBeCloseTo(600, 1);

    // And the selected row really is drawn, highlighted, inside the box.
    const selected = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-content"] > div.bg-primary-accent\\/20',
    );
    await expect(selected).not.toBeNull();
    const surface = canvasElement
      .querySelector('[data-testid="timeline-dense-surface"]')
      ?.getBoundingClientRect();
    const row = selected?.getBoundingClientRect();
    if (!surface || !row) throw new Error("no surface or selected row");
    await expect(row.top).toBeGreaterThanOrEqual(surface.top - 0.5);
    await expect(row.bottom).toBeLessThanOrEqual(surface.bottom + 0.5);
  },
});

export const ShiftDragZoomsToABox = meta.story({
  name: "(Test) Shift Drag Zooms To A Box",
  args: {
    roots: manySpans(3000),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    surface.setPointerCapture = () => undefined;
    surface.releasePointerCapture = () => undefined;
    const readout = () =>
      canvasElement.querySelector<HTMLElement>('[data-testid="dense-rows"]')
        ?.textContent ?? "";
    const marquee = () =>
      canvasElement.querySelector('[data-testid="timeline-dense-marquee"]');

    const rect = surface.getBoundingClientRect();
    const at = (fx: number, fy: number) => ({
      clientX: rect.left + rect.width * fx,
      clientY: rect.top + rect.height * fy,
    });
    const send = (type: string, point: ReturnType<typeof at>, shift = true) =>
      surface.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType: "mouse",
          shiftKey: shift,
          ...point,
        }),
      );

    const before = readout();
    send("pointerdown", at(0.3, 0.3));
    send("pointermove", at(0.7, 0.5));
    // The box is visible while you draw it — a zoom you cannot aim is a guess.
    await waitFor(() => expect(marquee()).not.toBeNull());
    send("pointerup", at(0.7, 0.5));

    // Releasing flies to exactly that region: a fifth of the rows, and the rows
    // grow to match. Both axes come from the box, nothing is inferred.
    await waitFor(() => expect(marquee()).toBeNull());
    await waitFor(() => expect(readout()).not.toBe(before));
    // It FLIES there, so this is the landing rather than the first frame.
    const rowSpan = () => {
      const window = /rows ([\d.]+)[–-]([\d.]+)/.exec(readout());
      if (!window) throw new Error(`no row window in "${readout()}"`);
      return Number(window[2]) - Number(window[1]);
    };
    await waitFor(() => expect(rowSpan()).toBeCloseTo(120, 0));

    // A stray shift-click is not a zoom to a pinhole.
    const settled = readout();
    send("pointerdown", at(0.5, 0.5));
    send("pointermove", at(0.502, 0.502));
    send("pointerup", at(0.502, 0.502));
    await expect(readout()).toBe(settled);
  },
});

export const AGestureTakesOverFromAFlight = meta.story({
  name: "(Test) A Gesture Takes Over From A Flight",
  args: {
    roots: manySpans(150),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const readout = () =>
      canvasElement.querySelector<HTMLElement>(
        '[data-testid="dense-rowheight"]',
      )?.textContent ?? "";

    const row = canvasElement.querySelectorAll<HTMLElement>(
      '[data-testid="timeline-dense-content"] > div',
    )[40];
    if (!row) throw new Error("expected a row to double-click");

    // Start the 320ms focus flight, then immediately zoom out with the toolbar.
    row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const zoomOut = canvasElement.querySelector<HTMLElement>(
      'button[aria-label="Zoom out"]',
    );
    if (!zoomOut) throw new Error("no zoom-out button");
    zoomOut.click();
    const afterGesture = readout();

    // The flight must not keep writing its own target over the gesture for the
    // rest of its 320ms: settle, then check nothing moved after the click.
    await new Promise((resolve) => setTimeout(resolve, 500));
    await expect(readout()).toBe(afterGesture);
    // And it did not land on the focus target (a human-height row).
    await expect(readout()).not.toContain("26.0px");
  },
});

/** Two fingers on the surface, as a touchscreen delivers them. */
const touch = (
  element: HTMLElement,
  type: string,
  pointerId: number,
  x: number,
  y: number,
) =>
  element.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: "touch",
      isPrimary: pointerId === 1,
      // A live contact reports a pressed button; a release reports none. The
      // renderer uses that to drop pointers whose release never arrived.
      buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
      clientX: x,
      clientY: y,
    }),
  );

export const PinchZoomsOnTouch = meta.story({
  name: "(Test) Pinch Zooms On Touch",
  args: {
    roots: manySpans(600),
    box: PHONE,
    gutter: "auto",
    pointer: "coarse",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    surface.setPointerCapture = () => undefined;
    surface.releasePointerCapture = () => undefined;
    const rowHeight = () =>
      canvasElement.querySelector<HTMLElement>(
        '[data-testid="dense-rowheight"]',
      )?.textContent ?? "";
    const rowWindow = () =>
      canvasElement.querySelector<HTMLElement>('[data-testid="dense-rows"]')
        ?.textContent ?? "";

    const rect = surface.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const midY = rect.top + rect.height / 2;

    // A touchscreen pinch is two pointers — never a wheel — and `touch-action:
    // none` means the browser will not zoom the page either. With one-pointer
    // logic only, this did nothing at all.
    await expect(rowHeight()).toContain("1.0px");
    touch(surface, "pointerdown", 1, midX - 40, midY - 40);
    touch(surface, "pointerdown", 2, midX + 40, midY + 40);
    for (const spread of [60, 90, 120, 150]) {
      touch(surface, "pointermove", 1, midX - spread, midY - spread);
      touch(surface, "pointermove", 2, midX + spread, midY + spread);
    }
    await waitFor(() => expect(rowHeight()).not.toContain("1.0px"));

    // Fingers apart = zoomed in: taller rows AND a narrower row window.
    const zoomed = rowWindow();
    const span = /rows ([\d.]+)[–-]([\d.]+)/.exec(zoomed);
    if (!span) throw new Error(`no row window in "${zoomed}"`);
    await expect(Number(span[2]) - Number(span[1])).toBeLessThan(600);

    // Lifting one finger hands over to a one-finger pan from where THAT finger
    // is. Inheriting the departed finger's origin panned by the whole finger
    // separation on the survivor's next small move.
    touch(surface, "pointerup", 2, midX + 150, midY + 150);
    const settled = rowWindow();
    touch(surface, "pointermove", 1, midX - 149, midY - 149);
    await expect(rowWindow()).toBe(settled);
    touch(surface, "pointerup", 1, midX - 149, midY - 149);

    // And pinching back in returns to the floor rather than sticking.
    touch(surface, "pointerdown", 1, midX - 150, midY - 150);
    touch(surface, "pointerdown", 2, midX + 150, midY + 150);
    for (const spread of [110, 70, 40, 15]) {
      touch(surface, "pointermove", 1, midX - spread, midY - spread);
      touch(surface, "pointermove", 2, midX + spread, midY + spread);
    }
    await waitFor(() => expect(rowHeight()).toContain("1.0px"));
  },
});

export const DoubleTapFocusesOnTouch = meta.story({
  name: "(Test) Double Tap Focuses On Touch",
  args: {
    roots: manySpans(150),
    box: PHONE,
    gutter: "auto",
    pointer: "coarse",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    surface.setPointerCapture = () => undefined;
    surface.releasePointerCapture = () => undefined;
    const readout = () =>
      canvasElement.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-readout"]',
      )?.textContent ?? "";

    const rect = surface.getBoundingClientRect();
    const x = rect.left + rect.width * 0.6;
    const y = rect.top + 200;

    await expect(readout()).toContain("fitted");
    // `dblclick` is not dependable from touch — Safari does not synthesise it —
    // so two quick taps in the same place are detected here instead.
    for (const _ of [1, 2]) {
      touch(surface, "pointerdown", 1, x, y);
      touch(surface, "pointerup", 1, x, y);
    }
    await waitFor(() => expect(readout()).toContain("zoomed"));
    await waitFor(() => expect(readout()).toContain("26.0px rows"));
  },
});

/**
 * Opening and closing the names is two taps in the same place, inside the
 * double-tap window — and it used to also fly the viewport to whatever row the
 * second tap landed on, because the rail tap returned early without ever marking
 * itself as spent.
 */
export const RailTapsAreNotADoubleTap = meta.story({
  name: "(Test) Rail Taps Are Not A Double Tap",
  args: {
    // Tall enough rows that the rail exists to be tapped.
    roots: manySpans(40),
    box: PHONE,
    gutter: "auto",
    pointer: "coarse",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    surface.setPointerCapture = () => undefined;
    surface.releasePointerCapture = () => undefined;
    const readout = () =>
      canvasElement.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-readout"]',
      )?.textContent ?? "";
    const names = () =>
      canvasElement.querySelectorAll(
        '[data-testid="timeline-dense-peek"] span[title], [data-testid="timeline-dense-content"] > div span[title]',
      ).length;

    const rect = surface.getBoundingClientRect();
    const x = rect.left + 4;
    const y = rect.top + 200;
    await expect(readout()).toContain("fitted");

    // Open, then close — one frame apart, which is how a real pair arrives: far
    // enough for the toggle to see its own new state, far INSIDE the double-tap
    // window. Dispatching both in one microtask tests neither, because React has
    // not re-rendered and both taps read the same `isOpen`.
    const frame = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    touch(surface, "pointerdown", 1, x, y);
    touch(surface, "pointerup", 1, x, y);
    await waitFor(() => expect(names()).toBeGreaterThan(0));
    await frame();
    touch(surface, "pointerdown", 1, x, y);
    touch(surface, "pointerup", 1, x, y);
    await waitFor(() => expect(names()).toBe(0));

    // Then a SINGLE tap in the chart, still inside the window. One tap is one
    // tap: it only looked like the second half of a double-tap because the rail's
    // release had recorded a tap it should never have recorded. This has to come
    // before the wait below, or the wait itself pushes it out of the window and
    // the sequence goes untested.
    await frame();
    touch(surface, "pointerdown", 1, rect.left + rect.width * 0.6, y);
    touch(surface, "pointerup", 1, rect.left + rect.width * 0.6, y);

    // "Nothing flew" has to outlast the flight, or it passes by being early — as
    // this assertion did at first, which made it green against the bug.
    let flew = false;
    try {
      await waitFor(() => expect(readout()).toContain("zoomed"), {
        timeout: 600,
      });
      flew = true;
    } catch {
      // Never zoomed inside a window longer than the 320ms flight: correct.
    }
    await expect(flew).toBe(false);
  },
});

export const TooltipFollowsTheContent = meta.story({
  name: "(Test) Tooltip Follows The Content",
  args: {
    roots: DEEP_TRACE,
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    const tooltip = () =>
      document.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-tooltip"]',
      )?.textContent ?? "";

    const rect = surface.getBoundingClientRect();
    surface.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerType: "mouse",
        clientX: rect.left + rect.width * 0.6,
        clientY: rect.top + 300,
      }),
    );
    await waitFor(() => expect(tooltip()).not.toBe(""));
    const named = tooltip();

    // Scrolling moves the rows under a pointer that has not moved. The tooltip
    // names whatever is under the pointer NOW — holding the row that used to be
    // there is how it ends up describing something else entirely.
    surface.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: 240,
        clientX: rect.left + rect.width * 0.6,
        clientY: rect.top + 300,
      }),
    );
    await waitFor(() => expect(tooltip()).not.toBe(named));
    await expect(tooltip()).not.toBe("");

    // The caller prefetches off `onHover`, so it has to hear about the row that
    // arrived under the still pointer. Firing only on pointermove meant the row
    // being read was the one row never fetched ahead: the tooltip renamed itself
    // and the callback went on naming the row that used to be there.
    const hovered = args.onHover as ReturnType<typeof fn>;
    const ids = hovered.mock.calls.map((call) => call[0] as string);
    await expect(ids.length).toBeGreaterThan(1);
    await expect(ids[ids.length - 1]).not.toBe(ids[0]);
  },
});

/** A playhead a story can drive by hand, standing in for the shared engine. */
function makeFakePlayhead() {
  let sec = 0;
  const listeners = new Set<(next: number) => void>();
  return {
    onSeek: fn(),
    playhead: {
      visible: true,
      getSec: () => sec,
      subscribe: (listener: (next: number) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      onSeek: (next: number) => PLAYBACK.onSeek(next),
    },
    tick(next: number) {
      sec = next;
      for (const listener of listeners) listener(next);
    },
  };
}
const PLAYBACK = makeFakePlayhead();

export const PlaybackSweepsAndGlows = meta.story({
  name: "(Test) Playback Sweeps And Glows",
  args: {
    roots: manySpans(150),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
    // The root span of manySpans covers the whole trace, so it is "playing"
    // throughout — the simplest thing a glow can be asserted against.
    activeIds: new Set(["n0"]),
    playhead: PLAYBACK.playhead,
  },
  play: async ({ canvasElement }) => {
    const line = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-playhead"]',
    );
    if (!line) throw new Error("no playhead line");

    // It starts at the origin and is moved by the position feed, not by a
    // re-render: 600 rows must not re-render to move a 2px line.
    await expect(line.style.transform).toBe("translateX(0px)");
    PLAYBACK.tick(12);
    await waitFor(() =>
      expect(line.style.transform).not.toBe("translateX(0px)"),
    );

    // The rows the playhead is over glow up — never the others dimming down.
    const glowing = canvasElement.querySelectorAll(
      '[data-testid="timeline-dense-content"] > div.bg-primary\\/20',
    );
    await expect(glowing.length).toBe(1);

    // And the axis is the scrub track: press it to place the playhead.
    const axis = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-axis"]',
    );
    if (!axis) throw new Error("no axis");
    const axisRect = axis.getBoundingClientRect();
    axis.setPointerCapture = () => undefined;
    axis.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        clientX: axisRect.left + axisRect.width / 2,
        clientY: axisRect.top + 8,
      }),
    );
    await expect(PLAYBACK.onSeek).toHaveBeenCalled();
  },
});

/** A selection whose row arrives late, as a deep link's does. */
function WithLateRows(props: TimelineDenseProps) {
  const [roots, setRoots] = useState<TimelineDenseProps["roots"]>([]);
  return (
    <div className="flex flex-col items-start gap-1">
      <button type="button" onClick={() => setRoots(props.roots)}>
        load rows
      </button>
      <TimelineDense {...props} roots={roots} />
    </div>
  );
}

/**
 * The names floating over the chart are the SAME rows as the chart's. Where the
 * gutter is only a rail, peeking is the one way to read a name during playback —
 * and the peek kept its own copy of the row backgrounds, which knew about
 * selection and hover but had never heard of playback: the row that was playing
 * glowed in the chart and stayed plain in the names beside it.
 */
export const ThePeekGlowsWithThePlayingRow = meta.story({
  name: "(Test) The Peek Glows With The Playing Row",
  args: {
    // 40 rows in this box are 15px: too short to hold a name in flow, tall
    // enough that the rail exists to peek at. At the 1px floor there is no rail
    // by design, so there would be nothing to hover.
    roots: manySpans(40),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
    // The root covers the whole trace, so it plays throughout.
    activeIds: new Set(["n0"]),
    playhead: PLAYBACK.playhead,
  },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    const rect = surface.getBoundingClientRect();
    surface.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerType: "mouse",
        clientX: rect.left + 4,
        // Well away from the playing row, so the hover wash cannot stand in for
        // the glow this is looking for.
        clientY: rect.top + 200,
      }),
    );
    const peek = await waitFor(() => {
      const el = canvasElement.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-peek"]',
      );
      if (!el) throw new Error("the rail did not peek");
      return el;
    });
    await expect(peek.querySelectorAll("div.bg-primary\\/20").length).toBe(1);
  },
});

export const ALateRowIsStillRevealed = meta.story({
  name: "(Test) A Late Row Is Still Revealed",
  args: {
    roots: DEEP_TRACE,
    selectedId: lastRowId(DEEP_TRACE),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    onSelect: fn(),
    onHover: fn(),
  },
  render: (args) => <WithLateRows {...args} />,
  play: async ({ canvasElement }) => {
    const rows = () =>
      canvasElement.querySelector<HTMLElement>('[data-testid="dense-rows"]')
        ?.textContent ?? "";

    // The selection is set before its row exists — a deep link naming an
    // observation fetched by id, or one past the load cap.
    await waitFor(() => expect(rows()).toContain("of 0"));
    const load = canvasElement.querySelector("button");
    if (!load) throw new Error("expected the load button");
    await userEvent.click(load);

    // Spending the one reveal on the absent row left the highlight off-screen
    // forever; un-advanced, the render that brings the rows retries.
    await waitFor(() => expect(rows()).toContain("of 3000"));
    await waitFor(() => {
      const window = /rows ([\d.]+)[–-]([\d.]+)/.exec(rows());
      if (!window) throw new Error(`no row window in "${rows()}"`);
      expect(Number(window[1])).toBeGreaterThan(2_000);
    });
  },
});

export const DoubleClickSelectsOnce = meta.story({
  name: "(Test) Double Click Selects Once",
  args: {
    roots: manySpans(150),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "neutral",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const row = canvasElement.querySelectorAll<HTMLElement>(
      '[data-testid="timeline-dense-content"] > div',
    )[40];
    if (!row) throw new Error("expected a row to double-click");

    // A double-click delivers two clicks and then dblclick. Selecting is not
    // free — it captures analytics and reopens the detail panel — so it must
    // happen exactly once, not three times.
    for (const detail of [1, 2]) {
      row.dispatchEvent(new MouseEvent("click", { bubbles: true, detail }));
    }
    row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, detail: 2 }));

    await expect(args.onSelect).toHaveBeenCalledTimes(1);
  },
});

export const TypeSquareStaysInsideTheRail = meta.story({
  name: "(Test) Type Square Stays Inside The Rail",
  args: {
    roots: deepNesting(12),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const squares = canvasElement.querySelectorAll<HTMLElement>(
      '[data-testid="timeline-dense-type-square"]',
    );
    // A closed rail has exactly one type indicator per row, so it cannot be the
    // part that gets clipped: at 10px wide, a depth-4 span's square hung most of
    // the way out of the rail's overflow-hidden box and showed as a sliver.
    await expect(squares.length).toBeGreaterThan(4);
    for (const square of squares) {
      const rail = square.parentElement?.getBoundingClientRect();
      const box = square.getBoundingClientRect();
      if (!rail) throw new Error("square without a rail");
      await expect(box.width).toBeGreaterThanOrEqual(2);
      await expect(box.left).toBeGreaterThanOrEqual(rail.left - 0.5);
      await expect(box.right).toBeLessThanOrEqual(rail.right + 0.5);
    }
  },
});

export const HoverOpensATooltip = meta.story({
  name: "(Test) Hover Opens A Tooltip",
  args: {
    roots: manySpans(150),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "neutral",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    const content = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-content"]',
    );
    if (!surface || !content) throw new Error("dense surface not found");

    const heightBefore = content.getBoundingClientRect().height;
    const rect = surface.getBoundingClientRect();
    surface.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
    );

    // Hover names what you are on — this layout spends no row pixels on text.
    // In the tooltip layer, so `document` rather than the story canvas.
    await waitFor(() =>
      expect(
        document.querySelector('[data-testid="timeline-dense-tooltip"]'),
      ).not.toBeNull(),
    );
    // And hovering must not move anything: no reflow, no new scroll.
    await expect(content.getBoundingClientRect().height).toBeCloseTo(
      heightBefore,
      1,
    );
    await expect(surface.scrollHeight).toBeLessThanOrEqual(
      surface.clientHeight,
    );
  },
});

/**
 * A tree's lines have to meet. The open gutter caps how deep it will indent — a
 * 1401-deep chain would otherwise push every name out of the box — and past that
 * cap a parent and its child flatten to the SAME indent. The connector was still
 * drawn one indent to the left of where the parent's spine actually descends, so
 * every generation past the cap hung off nothing.
 */
export const DeepConnectorsStillMeet = meta.story({
  name: "(Test) Deep Connectors Still Meet",
  args: {
    // Deeper than any gutter this narrow can indent, so the tail is flattened.
    roots: deepNesting(12),
    box: PHONE,
    gutter: "expanded",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const rows = [
      ...canvasElement.querySelectorAll<HTMLElement>(
        '[data-testid="timeline-dense-content"] > div',
      ),
    ];
    await expect(rows.length).toBeGreaterThan(8);

    // A chain, so the row above is the parent: where a row's own spine descends
    // is exactly where its child's connector must rise to.
    const spineOf = (row: HTMLElement) =>
      row.querySelector<HTMLElement>('div[class*="bottom-0"][class*="w-px"]');
    const stubOf = (row: HTMLElement) =>
      row.querySelector<HTMLElement>('div[class*="top-0"][class*="w-px"]');

    let checked = 0;
    for (let index = 1; index < rows.length; index++) {
      const parentSpine = spineOf(rows[index - 1]!);
      const stub = stubOf(rows[index]!);
      if (!parentSpine || !stub) continue;
      await expect(stub.getBoundingClientRect().left).toBeCloseTo(
        parentSpine.getBoundingClientRect().left,
        0,
      );
      checked++;
    }
    // Including the flattened tail, which is where this used to break.
    await expect(checked).toBeGreaterThan(6);
  },
});

/**
 * At hairline density the left side takes no width at all, so there is no rail to
 * tap — and a tap in the leftmost few px used to set the names override anyway.
 * Nothing happened, visibly: the override sat there until a double-tap zoomed the
 * rows tall enough to honour it, and then the names sprang open on their own.
 */
export const AHairlineTapDoesNotArmTheNames = meta.story({
  name: "(Test) A Hairline Tap Does Not Arm The Names",
  args: {
    roots: manySpans(600),
    box: PHONE,
    gutter: "auto",
    pointer: "coarse",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    surface.setPointerCapture = () => undefined;
    surface.releasePointerCapture = () => undefined;
    const readout = () =>
      canvasElement.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-readout"]',
      )?.textContent ?? "";
    const names = () =>
      canvasElement.querySelectorAll(
        '[data-testid="timeline-dense-peek"] span[title], [data-testid="timeline-dense-content"] > div span[title]',
      ).length;

    const rect = surface.getBoundingClientRect();
    // 600 rows in 600px: 1px each, no rail, nothing on the left to tap.
    await expect(readout()).toContain("1.0px rows");
    touch(surface, "pointerdown", 1, rect.left + 2, rect.top + 200);
    touch(surface, "pointerup", 1, rect.left + 2, rect.top + 200);
    await expect(names()).toBe(0);

    // Now zoom in far enough that rows COULD hold a name. Nothing asked for them.
    const x = rect.left + rect.width * 0.6;
    const y = rect.top + 200;
    for (const _ of [1, 2]) {
      touch(surface, "pointerdown", 1, x, y);
      touch(surface, "pointerup", 1, x, y);
    }
    await waitFor(() => expect(readout()).toContain("26.0px rows"));
    await expect(names()).toBe(0);
  },
});

/**
 * A double-tap to focus must select once, like a double-click does. `event.detail`
 * cannot tell: WebKit neither synthesises `dblclick` from taps nor counts them, so
 * both taps arrive as an ordinary first click and a detail-based guard sees
 * nothing. Selecting twice is not free — it captures an analytics event and
 * reopens the detail panel.
 */
export const ADoubleTapSelectsOnce = meta.story({
  name: "(Test) A Double Tap Selects Once",
  args: {
    roots: manySpans(40),
    box: PHONE,
    gutter: "auto",
    pointer: "coarse",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    surface.setPointerCapture = () => undefined;
    surface.releasePointerCapture = () => undefined;
    const rect = surface.getBoundingClientRect();
    const x = rect.left + rect.width * 0.6;
    const y = rect.top + 200;
    const row = document.elementFromPoint(x, y)?.closest("div");
    if (!row) throw new Error("no row under the tap");

    for (const _ of [1, 2]) {
      touch(surface, "pointerdown", 1, x, y);
      touch(surface, "pointerup", 1, x, y);
      // The compatibility click a tap produces: first-click detail, every time.
      row.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          detail: 1,
          clientX: x,
          clientY: y,
        }),
      );
    }
    const onSelect = args.onSelect as ReturnType<typeof fn>;
    await expect(onSelect.mock.calls.length).toBe(1);
  },
});

/**
 * The tooltip is the one thing in this renderer that belongs OUTSIDE the box.
 * Kept inside, it had to be clamped to the room left — and the clamp measured its
 * height with a guess (one row, when it grew to two), so hovering a row near the
 * bottom of a short panel cut the metrics line clean off.
 */
export const TheTooltipEscapesTheSurface = meta.story({
  name: "(Test) The Tooltip Escapes The Surface",
  args: {
    roots: manySpans(40),
    box: PEEK,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
    metricsOf: () => ({ costText: "$0.006425" }),
  },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    const rect = surface.getBoundingClientRect();
    // The LAST row, hard against the bottom edge — the case in the report.
    surface.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerType: "mouse",
        clientX: rect.left + rect.width * 0.7,
        clientY: rect.bottom - 3,
      }),
    );

    const tooltip = await waitFor(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-tooltip"]',
      );
      if (!el) throw new Error("no tooltip");
      return el;
    });

    // Not inside the box that clips it. Everything else here follows from that.
    await expect(surface.contains(tooltip)).toBe(false);

    // Both rows drawn, and nothing of it cut: an element clipped by an ancestor
    // still reports its full box, so the thing to check is that its own content
    // fits and that the box is on screen.
    await expect(tooltip.scrollHeight).toBeLessThanOrEqual(
      tooltip.clientHeight,
    );
    await expect(tooltip.innerText).toContain("$0.006425");
    const box = tooltip.getBoundingClientRect();
    await expect(box.height).toBeGreaterThan(20);
    await expect(box.bottom).toBeLessThanOrEqual(window.innerHeight + 0.5);
    await expect(box.right).toBeLessThanOrEqual(window.innerWidth + 0.5);
    await expect(box.top).toBeGreaterThanOrEqual(-0.5);
    await expect(box.left).toBeGreaterThanOrEqual(-0.5);

    // And the surface still has nothing to scroll — it never held the tooltip.
    await expect(surface.scrollWidth).toBeLessThanOrEqual(surface.clientWidth);
    await expect(surface.scrollHeight).toBeLessThanOrEqual(
      surface.clientHeight,
    );
  },
});

/** The shared args for the feedback-round stories: names visible, one trace. */
const READABLE = {
  roots: deepNesting(6),
  box: DESKTOP,
  gutter: "expanded" as const,
  pointer: "fine" as const,
  barColor: "type" as const,
  compress: false,
  showReadout: true,
  selectedId: null,
};

/**
 * A row is one thing. The tooltip used to be gated on the pointer being past the
 * gutter — so hovering a span's NAME, the most obvious way to ask what it is,
 * told you nothing, while the row highlighted across its full width anyway.
 */
export const TheTooltipCoversTheWholeRow = meta.story({
  name: "(Test) The Tooltip Covers The Whole Row",
  args: { ...READABLE, onSelect: fn(), onHover: fn() },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    const rect = surface.getBoundingClientRect();
    // Over the NAME, well inside the gutter.
    surface.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerType: "mouse",
        clientX: rect.left + 30,
        clientY: rect.top + 40,
      }),
    );
    const tooltip = await waitFor(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-tooltip"]',
      );
      if (!el) throw new Error("hovering a name said nothing");
      return el;
    });
    await expect(tooltip.innerText).toContain("level-");
  },
});

/**
 * Hue means observation type and nothing else. Focus used to repaint the bar in
 * the accent — which is the same blue that means SPAN — so a hovered generation
 * changed species under the cursor.
 */
export const HoverDoesNotRecolourTheBar = meta.story({
  name: "(Test) Hover Does Not Recolour The Bar",
  args: {
    ...READABLE,
    roots: manySpans(40),
    selectedId: "n0",
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    const bars = () => [
      ...canvasElement.querySelectorAll<HTMLElement>(
        '[data-testid="timeline-dense-bar"]',
      ),
    ];
    const hueOf = (bar: HTMLElement) =>
      [...bar.classList].find((name) => name.startsWith("bg-")) ?? "";

    const before = bars().map(hueOf);
    await expect(before.length).toBeGreaterThan(3);

    const rect = surface.getBoundingClientRect();
    surface.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerType: "mouse",
        clientX: rect.left + rect.width * 0.7,
        clientY: rect.top + 60,
      }),
    );
    await waitFor(() =>
      expect(
        document.querySelector('[data-testid="timeline-dense-tooltip"]'),
      ).not.toBeNull(),
    );

    // Same hues, hovered or not — and the accent never paints a bar at all.
    await expect(bars().map(hueOf)).toEqual(before);
    await expect(before.some((hue) => hue.includes("primary-accent"))).toBe(
      false,
    );
    // Selection still reads, as a ring rather than a repaint.
    const ringed = bars().filter((bar) =>
      [...bar.classList].some((name) => name.startsWith("ring-")),
    );
    await expect(ringed.length).toBe(1);
  },
});

/** A control that can do nothing should say so rather than look broken. */
export const FitIsDisabledWhenItWouldDoNothing = meta.story({
  name: "(Test) Fit Is Disabled When It Would Do Nothing",
  args: { ...READABLE, roots: manySpans(12), onSelect: fn(), onHover: fn() },
  play: async ({ canvasElement }) => {
    const fit = () =>
      canvasElement.querySelector<HTMLButtonElement>(
        'button[aria-label*="fits"], button[aria-label="Fit whole trace"]',
      );
    const button = fit();
    if (!button) throw new Error("no fit button");
    // At rest the whole trace already fits.
    await expect(button.disabled).toBe(true);

    const zoomIn = canvasElement.querySelector<HTMLButtonElement>(
      'button[aria-label="Zoom in"]',
    );
    if (!zoomIn) throw new Error("no zoom button");
    await userEvent.click(zoomIn);
    await waitFor(() => expect(fit()?.disabled).toBe(false));
  },
});

/**
 * A long trace fits as 1px rows — the whole clock, no names. The spent fit
 * control used to sit there disabled, so there was no obvious way to get the
 * labels back without also shrinking the duration. "Show labels" grows only
 * the rows; Fit then takes you back to the overview.
 */
export const ShowLabelsKeepsTheWholeClock = meta.story({
  name: "(Test) Show Labels Keeps The Whole Clock",
  args: {
    roots: manySpans(150),
    box: DESKTOP,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const readout = () =>
      canvasElement.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-readout"]',
      )?.textContent ?? "";
    const toolbar = () =>
      canvasElement.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-toolbar"]',
      );
    const labels = () =>
      canvasElement.querySelectorAll('[data-testid="timeline-dense-metrics"]')
        .length;

    await expect(readout()).toContain("fitted");
    await expect(readout()).toContain("4.0px rows");
    await expect(labels()).toBe(0);

    const show = canvasElement.querySelector<HTMLButtonElement>(
      'button[aria-label="Show labels"]',
    );
    if (!show) throw new Error("no show-labels button");
    await expect(show.disabled).toBe(false);
    await expect(show.innerText.toLowerCase()).toContain("show labels");
    const caption = [...(toolbar()?.querySelectorAll("span") ?? [])].find(
      (el) => el.textContent?.trim().toLowerCase() === "show labels",
    );
    if (!caption) throw new Error("Show labels text is not on the button");
    await expect(show.contains(caption)).toBe(true);
    await userEvent.click(caption);

    await waitFor(() => expect(readout()).toContain("26.0px rows (labelled)"));
    await expect(readout()).toContain("zoomed");
    await expect(labels()).toBeGreaterThan(0);

    const fit = canvasElement.querySelector<HTMLButtonElement>(
      'button[aria-label="Fit whole trace"]',
    );
    if (!fit) throw new Error("no fit button after expanding");
    await expect(fit.disabled).toBe(false);
    await userEvent.click(fit);

    await waitFor(() => expect(readout()).toContain("fitted"));
    await expect(readout()).toContain("4.0px rows");
    await expect(labels()).toBe(0);
  },
});

/**
 * A box that only slices time must not hide Fit behind Show labels. Growing
 * the rows would keep that narrow clock; Fit is the way back to the overview.
 */
export const FitStaysAfterATimeOnlyBox = meta.story({
  name: "(Test) Fit Stays After A Time Only Box",
  args: {
    roots: manySpans(150),
    box: DESKTOP,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    surface.setPointerCapture = () => undefined;
    surface.releasePointerCapture = () => undefined;
    const readout = () =>
      canvasElement.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-readout"]',
      )?.textContent ?? "";

    await expect(
      canvasElement.querySelector('button[aria-label="Show labels"]'),
    ).not.toBeNull();

    const rect = surface.getBoundingClientRect();
    const drag = (type: string, x: number, y: number) =>
      surface.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType: "mouse",
          buttons: type === "pointerup" ? 0 : 1,
          clientX: x,
          clientY: y,
        }),
      );
    // Full height, half the clock: rows stay hairline, time narrows.
    drag("pointerdown", rect.left + rect.width * 0.25, rect.top + 2);
    drag("pointermove", rect.left + rect.width * 0.75, rect.bottom - 2);
    drag("pointerup", rect.left + rect.width * 0.75, rect.bottom - 2);
    await waitFor(() => expect(readout()).toContain("zoomed"));
    await expect(readout()).toMatch(/[1-4]\.\dpx rows/);

    await expect(
      canvasElement.querySelector('button[aria-label="Show labels"]'),
    ).toBeNull();
    const fit = canvasElement.querySelector<HTMLButtonElement>(
      'button[aria-label="Fit whole trace"]',
    );
    if (!fit) throw new Error("Fit disappeared after a time-only box");
    await expect(fit.disabled).toBe(false);
  },
});

/**
 * A short trace on a narrow pane already has readable rows, but auto will not
 * spend the lane on names. Show labels is still the ask: take the gutter,
 * even if the bars get thinner.
 */
export const ShowLabelsOpensTheGutterOnANarrowPane = meta.story({
  name: "(Test) Show Labels Opens The Gutter On A Narrow Pane",
  args: {
    roots: manySpans(12),
    box: PHONE,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const names = () =>
      canvasElement.querySelectorAll(
        '[data-testid="timeline-dense-peek"] span[title], [data-testid="timeline-dense-content"] > div span[title]',
      ).length;
    const barLeft = () => {
      const bar = canvasElement.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-bar"]',
      );
      return bar?.getBoundingClientRect().left ?? 0;
    };

    await expect(names()).toBe(0);
    const show = canvasElement.querySelector<HTMLButtonElement>(
      'button[aria-label="Show labels"]',
    );
    if (!show) throw new Error("no show-labels button on a squeezed pane");
    await expect(show.innerText.toLowerCase()).toContain("show labels");
    const caption = [...show.querySelectorAll("span")].find(
      (el) => el.textContent?.trim().toLowerCase() === "show labels",
    );
    if (!caption) throw new Error("Show labels text is not on the button");
    const leftBefore = barLeft();

    await userEvent.click(caption);
    await waitFor(() => expect(names()).toBeGreaterThan(0));
    await expect(barLeft()).toBeGreaterThan(leftBefore + 40);
  },
});

/**
 * A pane too narrow to ever commit the gutter still offers Show labels, but
 * names float as a peek overlay. A second rail tap must be able to dismiss
 * that peek: committedOpen never becomes true, so the toggle has to look at
 * the held-open pin, not the committed lane.
 */
const TOO_NARROW_TO_COMMIT = { width: 220, height: 400 };

export const ShowLabelsPeekTogglesOffOnATooNarrowPane = meta.story({
  name: "(Test) Show Labels Peek Toggles Off On A Too Narrow Pane",
  args: {
    roots: manySpans(12),
    box: TOO_NARROW_TO_COMMIT,
    gutter: "auto",
    pointer: "coarse",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    surface.setPointerCapture = () => undefined;
    surface.releasePointerCapture = () => undefined;
    const peekNames = () =>
      canvasElement.querySelectorAll(
        '[data-testid="timeline-dense-peek"] span[title]',
      ).length;
    const gutterNames = () =>
      canvasElement.querySelectorAll(
        '[data-testid="timeline-dense-content"] > div span[title]',
      ).length;
    const barLeft = () => {
      const bar = canvasElement.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-bar"]',
      );
      return bar?.getBoundingClientRect().left ?? 0;
    };
    const tapRail = () => {
      const rect = surface.getBoundingClientRect();
      touch(surface, "pointerdown", 1, rect.left + 2, rect.top + 80);
      touch(surface, "pointerup", 1, rect.left + 2, rect.top + 80);
    };

    const show = canvasElement.querySelector<HTMLButtonElement>(
      'button[aria-label="Show labels"]',
    );
    if (!show) throw new Error("no show-labels button on a peek-only pane");
    const leftBefore = barLeft();

    await userEvent.click(show);
    await waitFor(() => expect(peekNames()).toBeGreaterThan(0));
    await expect(gutterNames()).toBe(0);
    await expect(Math.abs(barLeft() - leftBefore)).toBeLessThan(20);

    tapRail();
    await waitFor(() => expect(peekNames()).toBe(0));
    await expect(gutterNames()).toBe(0);

    tapRail();
    await waitFor(() => expect(peekNames()).toBeGreaterThan(0));
    await expect(gutterNames()).toBe(0);
  },
});

/**
 * After a coarse rail tap collapses a committed gutter, Show labels must
 * clear that leftover override and take the lane again. A stale
 * override==="collapsed" used to leave names as a peek overlay.
 */
export const ShowLabelsRecommitsAfterARailCollapse = meta.story({
  name: "(Test) Show Labels Recommits After A Rail Collapse",
  args: {
    roots: manySpans(12),
    box: PHONE,
    gutter: "auto",
    pointer: "coarse",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    surface.setPointerCapture = () => undefined;
    surface.releasePointerCapture = () => undefined;
    const peekNames = () =>
      canvasElement.querySelectorAll(
        '[data-testid="timeline-dense-peek"] span[title]',
      ).length;
    const gutterNames = () =>
      canvasElement.querySelectorAll(
        '[data-testid="timeline-dense-content"] > div span[title]',
      ).length;
    const barLeft = () => {
      const bar = canvasElement.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-bar"]',
      );
      return bar?.getBoundingClientRect().left ?? 0;
    };
    const tapRail = () => {
      const rect = surface.getBoundingClientRect();
      touch(surface, "pointerdown", 1, rect.left + 2, rect.top + 80);
      touch(surface, "pointerup", 1, rect.left + 2, rect.top + 80);
    };
    const clickShowLabels = async () => {
      const show = canvasElement.querySelector<HTMLButtonElement>(
        'button[aria-label="Show labels"]',
      );
      if (!show) throw new Error("no show-labels button");
      await userEvent.click(show);
    };

    const leftClosed = barLeft();
    await expect(gutterNames()).toBe(0);

    await clickShowLabels();
    await waitFor(() => expect(gutterNames()).toBeGreaterThan(0));
    await expect(peekNames()).toBe(0);
    await expect(barLeft()).toBeGreaterThan(leftClosed + 40);

    tapRail();
    await waitFor(() => expect(gutterNames()).toBe(0));
    await expect(peekNames()).toBe(0);

    await clickShowLabels();
    await waitFor(() => expect(gutterNames()).toBeGreaterThan(0));
    await expect(peekNames()).toBe(0);
    await expect(barLeft()).toBeGreaterThan(leftClosed + 40);
  },
});

/**
 * Panning a hairline overview is not a time zoom. Show labels must stay, or
 * Fit would snap the window back to the top of the tree instead of naming
 * the rows you just scrolled to.
 */
export const ShowLabelsSurvivesAVerticalPan = meta.story({
  name: "(Test) Show Labels Survives A Vertical Pan",
  args: {
    roots: manySpans(800),
    box: DESKTOP,
    gutter: "auto",
    pointer: "fine",
    barColor: "type",
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    const readout = () =>
      canvasElement.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-readout"]',
      )?.textContent ?? "";
    const show = () =>
      canvasElement.querySelector<HTMLButtonElement>(
        'button[aria-label="Show labels"]',
      );

    await expect(readout()).toContain("fitted");
    await expect(show()).not.toBeNull();

    const rect = surface.getBoundingClientRect();
    surface.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        deltaY: 240,
      }),
    );
    await waitFor(() => expect(readout()).toContain("zoomed"));
    await expect(readout()).toMatch(/1\.0px rows/);
    await expect(show()).not.toBeNull();
    await expect(
      canvasElement.querySelector('button[aria-label="Fit whole trace"]'),
    ).toBeNull();

    if (!show()) throw new Error("Show labels vanished after a vertical pan");
    await userEvent.click(show()!);
    await waitFor(() => expect(readout()).toContain("26.0px rows (labelled)"));
    await expect(readout()).toContain("zoomed");
  },
});

/** Collapse in the tree means collapse here: the same set, honoured. */
export const CollapsedRowsAreNotDrawn = meta.story({
  name: "(Test) Collapsed Rows Are Not Drawn",
  args: {
    ...READABLE,
    collapsed: new Set(["n0"]),
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    // A six-deep chain with its root collapsed is one row.
    await expect(
      canvasElement.querySelectorAll('[data-testid="timeline-dense-row"]')
        .length,
    ).toBe(1);
  },
});

/**
 * The tooltip does not say when a span started. The bar's position on the axis
 * already says it, and in words it was one more number to read past: `@0ms` on a
 * root means nothing, and a row that starts 11m 52s in and runs 11m 52s put two
 * identical unlabelled durations side by side.
 */
export const TheTooltipDoesNotRepeatTheAxis = meta.story({
  name: "(Test) The Tooltip Does Not Repeat The Axis",
  args: { ...READABLE, onSelect: fn(), onHover: fn() },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    const rect = surface.getBoundingClientRect();
    const hover = (offsetY: number) =>
      surface.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerType: "mouse",
          clientX: rect.left + rect.width * 0.7,
          clientY: rect.top + offsetY,
        }),
      );
    const tooltip = () =>
      document.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-tooltip"]',
      );

    // The root, which starts the trace...
    hover(6);
    await waitFor(() => expect(tooltip()).not.toBeNull());
    const rootText = tooltip()!.innerText;
    await expect(rootText).not.toContain("@");
    await expect(rootText).not.toContain("starts at");

    // ...and a row that starts well into it. Neither mentions when.
    hover(6 + 26 * 3);
    await waitFor(() => expect(tooltip()!.innerText).not.toBe(rootText));
    await expect(tooltip()!.innerText).not.toContain("@");
    await expect(tooltip()!.innerText).not.toContain("starts at");
    // What it DOES say: the name, and how long it took.
    await expect(tooltip()!.innerText).toMatch(/\d/);
  },
});

/** Drag draws the zoom box — no modifier, because scroll already pans. */
export const DragZoomsWithoutAModifier = meta.story({
  name: "(Test) Drag Zooms Without A Modifier",
  args: { ...READABLE, roots: manySpans(150), onSelect: fn(), onHover: fn() },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    // Spy rather than stub: WHEN the pointer is captured is the contract here.
    // Capture retargets the click that follows to the capturing element, so
    // taking it on pointerdown kills click-to-select on every row — and no
    // synthetic event in a test can observe the retargeting itself, which is
    // exactly how that shipped once already.
    const captures: number[] = [];
    surface.setPointerCapture = (pointerId: number) => {
      captures.push(pointerId);
    };
    surface.releasePointerCapture = () => undefined;
    const readout = () =>
      canvasElement.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-readout"]',
      )?.textContent ?? "";
    await expect(readout()).toContain("fitted");

    const rect = surface.getBoundingClientRect();
    const drag = (type: string, x: number, y: number) =>
      surface.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType: "mouse",
          buttons: type === "pointerup" ? 0 : 1,
          clientX: x,
          clientY: y,
        }),
      );
    drag("pointerdown", rect.left + rect.width * 0.3, rect.top + 100);
    // A press is not a drag yet, so nothing is captured and no box exists.
    await expect(captures).toEqual([]);
    await expect(
      canvasElement.querySelector('[data-testid="timeline-dense-marquee"]'),
    ).toBeNull();

    drag("pointermove", rect.left + rect.width * 0.6, rect.top + 240);
    // Past the threshold it is a drag, and only now does it take the pointer.
    await expect(captures).toEqual([1]);

    drag("pointerup", rect.left + rect.width * 0.6, rect.top + 240);
    await waitFor(() => expect(readout()).toContain("zoomed"));
  },
});

/** ...but a finger still pans, because a finger has no scroll wheel. */
export const AFingerDragStillPans = meta.story({
  name: "(Test) A Finger Drag Still Pans",
  args: {
    ...READABLE,
    // More rows than the box holds, or there is no window left to pan.
    roots: manySpans(3000),
    pointer: "coarse" as const,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    surface.setPointerCapture = () => undefined;
    surface.releasePointerCapture = () => undefined;
    const rowsLabel = () =>
      canvasElement.querySelector<HTMLElement>('[data-testid="dense-rows"]')
        ?.textContent ?? "";

    const rect = surface.getBoundingClientRect();
    const before = rowsLabel();
    const heightBefore =
      canvasElement.querySelector<HTMLElement>(
        '[data-testid="dense-rowheight"]',
      )?.textContent ?? "";
    touch(
      surface,
      "pointerdown",
      1,
      rect.left + rect.width * 0.5,
      rect.top + 400,
    );
    touch(
      surface,
      "pointermove",
      1,
      rect.left + rect.width * 0.5,
      rect.top + 120,
    );
    touch(
      surface,
      "pointerup",
      1,
      rect.left + rect.width * 0.5,
      rect.top + 120,
    );

    // The window MOVED...
    await waitFor(() => expect(rowsLabel()).not.toBe(before));
    // ...and did not resize: a box zoom would have changed the row height.
    await expect(
      canvasElement.querySelector<HTMLElement>(
        '[data-testid="dense-rowheight"]',
      )?.textContent,
    ).toBe(heightBefore);
  },
});

/**
 * The cursor should not promise a gesture the surface does not perform. It was a
 * grab hand, from when drag meant pan; drag draws a zoom box now, so the surface
 * says nothing at rest and the bars carry the only real affordance — a click
 * that selects.
 */
export const TheCursorMatchesTheGesture = meta.story({
  name: "(Test) The Cursor Matches The Gesture",
  args: { ...READABLE, roots: manySpans(40), onSelect: fn(), onHover: fn() },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    await expect(getComputedStyle(surface).cursor).toBe("default");

    const bar = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-bar"]',
    );
    if (!bar) throw new Error("no bar");
    await expect(getComputedStyle(bar).cursor).toBe("pointer");
  },
});

/**
 * The toolbar does not explain the surface. Every gesture it supports is one you
 * would have tried anyway, and the space is better spent saying where you ARE —
 * which is worth saying only once you are somewhere other than the whole trace.
 */
export const TheToolbarDoesNotExplainItself = meta.story({
  name: "(Test) The Toolbar Does Not Explain Itself",
  args: { ...READABLE, roots: manySpans(12), onSelect: fn(), onHover: fn() },
  play: async ({ canvasElement }) => {
    const toolbar = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-toolbar"]',
    );
    if (!toolbar) throw new Error("no toolbar");

    // At rest: no tutorial, and nothing about where you are — you are nowhere in
    // particular, you are looking at all of it.
    for (const word of ["drag", "scroll", "pinch", "double-click", "window"]) {
      await expect(toolbar.innerText.toLowerCase()).not.toContain(word);
    }

    // Three controls, all of them about the view: out, in, fit. No colour
    // reference card (the tooltip names a type where you are asking) and no
    // names toggle (`auto` decides, and the rail peeks when you want a look).
    const labels = [
      ...toolbar.querySelectorAll<HTMLButtonElement>("button"),
    ].map((button) => button.getAttribute("aria-label"));
    await expect(labels).toEqual([
      "Zoom out",
      "Zoom in",
      "Whole trace already fits",
    ]);

    const zoomIn = canvasElement.querySelector<HTMLButtonElement>(
      'button[aria-label="Zoom in"]',
    );
    if (!zoomIn) throw new Error("no zoom button");
    await userEvent.click(zoomIn);

    // Zoomed: it says where you are, and still explains nothing.
    await waitFor(() =>
      expect(toolbar.innerText.toLowerCase()).toContain("window"),
    );
    await expect(toolbar.innerText.toLowerCase()).not.toContain("drag");
    await expect(toolbar.innerText.toLowerCase()).not.toContain("px");
  },
});

/**
 * A second finger abandons a box the first one had started. Every release commits
 * whatever box it finds, so a rectangle left behind by an interrupted drag flies
 * the viewport somewhere nobody asked to go — one pinch later, on a release that
 * had nothing to do with it.
 */
export const APinchAbandonsAnUnfinishedBox = meta.story({
  name: "(Test) A Pinch Abandons An Unfinished Box",
  args: {
    ...READABLE,
    roots: manySpans(150),
    pointer: "coarse" as const,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    surface.setPointerCapture = () => undefined;
    surface.releasePointerCapture = () => undefined;
    const readout = () =>
      canvasElement.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-readout"]',
      )?.textContent ?? "";
    const marquee = () =>
      canvasElement.querySelector('[data-testid="timeline-dense-marquee"]');
    const rect = surface.getBoundingClientRect();
    await expect(readout()).toContain("fitted");

    // A finger WITH shift draws a box — the one way touch asks for one.
    const shifted = (type: string, x: number, y: number) =>
      surface.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
          shiftKey: true,
          buttons: type === "pointerup" ? 0 : 1,
          clientX: x,
          clientY: y,
        }),
      );
    shifted("pointerdown", rect.left + rect.width * 0.3, rect.top + 100);
    shifted("pointermove", rect.left + rect.width * 0.6, rect.top + 260);
    await waitFor(() => expect(marquee()).not.toBeNull());

    // A second finger arrives: that is a pinch now, and the box is abandoned.
    touch(
      surface,
      "pointerdown",
      2,
      rect.left + rect.width * 0.5,
      rect.top + 300,
    );
    await waitFor(() => expect(marquee()).toBeNull());

    // Releasing must not fly anywhere: there is no box left to fly to.
    shifted("pointerup", rect.left + rect.width * 0.6, rect.top + 260);
    let flew = false;
    try {
      await waitFor(() => expect(readout()).toContain("zoomed"), {
        timeout: 600,
      });
      flew = true;
    } catch {
      // Still fitted, which is the point.
    }
    await expect(flew).toBe(false);
  },
});

/**
 * A streaming call spends part of its bar waiting for the first token. The wide
 * timeline says so with a second shade; here it is a divider, because a shade
 * needs a bar tall enough to read one and these are a single pixel at the floor.
 */
export const TheFirstTokenHasItsMark = meta.story({
  name: "(Test) The First Token Has Its Mark",
  args: {
    roots: streamingSpan(),
    box: DESKTOP,
    gutter: "expanded" as const,
    pointer: "fine" as const,
    barColor: "type" as const,
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
  },
  play: async ({ canvasElement }) => {
    const bar = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-bar"]',
    );
    if (!bar) throw new Error("no bar");
    const mark = bar.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-first-token"]',
    );
    if (!mark) throw new Error("the streaming split is not drawn");

    // A quarter of the way along, whatever the scale happens to be.
    const barBox = bar.getBoundingClientRect();
    const markBox = mark.getBoundingClientRect();
    const fraction = (markBox.left - barBox.left) / barBox.width;
    await expect(fraction).toBeGreaterThan(0.2);
    await expect(fraction).toBeLessThan(0.3);
    // And inside its own bar, not over the lane.
    await expect(markBox.right).toBeLessThanOrEqual(barBox.right + 0.5);
  },
});

/**
 * The cluster stays inside its box, and it moves to the side that has room. It
 * used to inherit the side `layout()` chose by measuring the duration alone,
 * which is why annotations vanished mid-zoom: growing a bar turned the budget
 * from "the rest of the lane" into "this bar".
 */
export const TheClusterTakesTheRoomierSide = meta.story({
  name: "(Test) The Cluster Takes The Roomier Side",
  args: {
    roots: threeSpans(),
    box: DESKTOP,
    gutter: "expanded" as const,
    pointer: "fine" as const,
    barColor: "type" as const,
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
    metricsOf: () => ({ costText: "$0.0021" }),
  },
  play: async ({ canvasElement }) => {
    const clusters = [
      ...canvasElement.querySelectorAll<HTMLElement>(
        '[data-testid="timeline-dense-metrics"]',
      ),
    ];
    await expect(clusters.length).toBeGreaterThan(0);

    for (const cluster of clusters) {
      const row = cluster.closest('[data-testid="timeline-dense-row"]');
      const bar = row?.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-bar"]',
      );
      if (!bar) continue;
      const barBox = bar.getBoundingClientRect();
      const lane = cluster.parentElement!.getBoundingClientRect();
      // Whichever side it picked, it must be the one with the most room.
      const after = lane.right - barBox.right;
      const before = barBox.left - lane.left;
      if (cluster.dataset.placement === "after") {
        await expect(after).toBeGreaterThanOrEqual(before - 0.5);
      }
      // And it never spills: the cluster clips, so what it admits has to fit.
      await expect(cluster.scrollWidth).toBeLessThanOrEqual(
        cluster.clientWidth + 0.5,
      );
      await expect(cluster.innerText).toContain("$0.0021");
    }
  },
});

/**
 * When the lane is too narrow for even one metric, the row draws none — and the
 * tooltip is what keeps it from going silent. It states the same duration and
 * cost for every row at every density, which is why the cluster does not need a
 * title on a box of zero width.
 */
export const ARowTooTightForMetricsStillSaysThem = meta.story({
  name: "(Test) A Row Too Tight For Metrics Still Says Them",
  args: {
    // 600 rows in this box are 1px each: no room for a metric anywhere.
    roots: manySpans(600),
    box: PHONE,
    gutter: "auto" as const,
    pointer: "fine" as const,
    barColor: "type" as const,
    compress: false,
    showReadout: true,
    selectedId: null,
    onSelect: fn(),
    onHover: fn(),
    metricsOf: () => ({ costText: "$0.0021" }),
  },
  play: async ({ canvasElement }) => {
    // Nothing is drawn beside a 1px bar.
    await expect(
      canvasElement.querySelectorAll('[data-testid="timeline-dense-metrics"]')
        .length,
    ).toBe(0);

    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    const rect = surface.getBoundingClientRect();
    surface.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerType: "mouse",
        clientX: rect.left + rect.width * 0.6,
        clientY: rect.top + 200,
      }),
    );

    const tooltip = await waitFor(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-tooltip"]',
      );
      if (!el) throw new Error("no tooltip");
      return el;
    });
    // The duration and the cost, on a row that had no room to print either.
    await expect(tooltip.innerText).toMatch(/\d/);
    await expect(tooltip.innerText).toContain("$0.0021");
  },
});
