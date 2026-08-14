import { expect, fn, waitFor } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { TimelineDense } from "./TimelineDense";
import {
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
 * readout are taken — room for 150 rows at the 4px floor, so the "at the floor"
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

export const OneHundredFiftySpansExactlyAtTheFloor = meta.story({
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

/** More rows than 4px each can show: the extra are panned to, maps-style. */
export const FiveHundredSpansPannable = meta.story({
  args: {
    roots: manySpans(500),
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

    // A pinch carries ctrlKey, and that zooms.
    wheel({ deltaY: -40, ctrlKey: true });
    await waitFor(() => expect(rowHeight()).not.toBe(heightBefore));
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
