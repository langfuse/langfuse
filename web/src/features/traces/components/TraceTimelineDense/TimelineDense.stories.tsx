import { expect, fn, waitFor } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { TimelineDense } from "./TimelineDense";
import {
  deepNesting,
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
      const bar = label.parentElement?.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-bar"]',
      );
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
      const bar = label.parentElement?.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-bar"]',
      );
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

export const TooltipShowsCostAndTokens = meta.story({
  name: "(Test) Tooltip Shows Cost And Tokens",
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
    factsOf: () => ["$0.006425", "2,100 → 380 (∑ 2,480)"],
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

    const tooltip = () =>
      canvasElement.querySelector<HTMLElement>(
        '[data-testid="timeline-dense-tooltip"]',
      );
    await waitFor(() => expect(tooltip()).not.toBeNull());
    const box = tooltip()!;

    // At this density hover IS how a row is read, so it says what a tree row
    // says: identity, then the metrics.
    await expect(box.innerText).toContain("$0.006425");
    await expect(box.innerText).toContain("2,100 → 380");
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
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-surface"]',
    );
    if (!surface) throw new Error("dense surface not found");
    const tooltip = () =>
      canvasElement.querySelector<HTMLElement>(
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
    await waitFor(() =>
      expect(
        canvasElement.querySelector('[data-testid="timeline-dense-tooltip"]'),
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
