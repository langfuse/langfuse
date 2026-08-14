import { expect, waitFor } from "storybook/test";
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

export const FiftySpansOnAPhone = meta.story({
  args: {
    roots: manySpans(50),
    box: PHONE,
    showNames: false,
    barColor: "neutral",
    compress: false,
    showReadout: true,
  },
});

export const OneHundredFiftySpansExactlyAtTheFloor = meta.story({
  args: {
    roots: manySpans(150),
    box: PHONE,
    showNames: false,
    barColor: "neutral",
    compress: false,
    showReadout: true,
  },
});

/** More rows than 4px each can show: the extra are panned to, maps-style. */
export const FiveHundredSpansPannable = meta.story({
  args: {
    roots: manySpans(500),
    box: PHONE,
    showNames: false,
    barColor: "neutral",
    compress: false,
    showReadout: true,
  },
});

export const TypeColouredBars = meta.story({
  args: {
    roots: manySpans(150),
    box: PHONE,
    showNames: false,
    barColor: "type",
    compress: false,
    showReadout: true,
  },
});

/** Few enough rows that they stay comfortable and keep their text. */
export const ShortTraceStaysReadable = meta.story({
  args: {
    roots: threeSpans(),
    box: PHONE,
    showNames: false,
    barColor: "neutral",
    compress: false,
    showReadout: true,
  },
});

export const ReporterShapeInAPeek = meta.story({
  args: {
    roots: reporterTrace(),
    box: PEEK,
    showNames: false,
    barColor: "neutral",
    compress: false,
    showReadout: true,
  },
});

/** The comparison that matters: the same trace with the names still on. */
export const WithNamesForComparison = meta.story({
  args: {
    roots: manySpans(150),
    box: PHONE,
    showNames: true,
    barColor: "neutral",
    compress: false,
    showReadout: true,
  },
});

export const LongTailCompressed = meta.story({
  args: {
    roots: longTailTrace(),
    box: PHONE,
    showNames: false,
    barColor: "type",
    compress: true,
    showReadout: true,
  },
});

export const NeitherAxisScrolls = meta.story({
  name: "(Test) Neither Axis Scrolls",
  args: {
    roots: manySpans(150),
    box: PHONE,
    showNames: false,
    barColor: "neutral",
    compress: false,
    showReadout: true,
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

export const DoubleClickFocusesBothAxes = meta.story({
  name: "(Test) Double Click Focuses Both Axes",
  args: {
    roots: manySpans(150),
    box: PHONE,
    showNames: false,
    barColor: "neutral",
    compress: false,
    showReadout: true,
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
    // narrows onto the element, rather than only zooming the clock.
    await waitFor(() => expect(readout()).toContain("zoomed"));
    await expect(readout()).toContain("26.0px rows");
    await expect(readout()).not.toContain(`showing 150/150`);
  },
});

export const HoverOpensATooltip = meta.story({
  name: "(Test) Hover Opens A Tooltip",
  args: {
    roots: manySpans(150),
    box: PHONE,
    showNames: false,
    barColor: "neutral",
    compress: false,
    showReadout: true,
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
