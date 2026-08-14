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
 * 640px leaves a 604px row viewport — exactly enough for 150 hairline rows, so
 * the "at the floor" story really is at the floor and not one row over it.
 */
const PHONE = { width: 360, height: 640 };
/** The peek panel: narrow and short. */
const PEEK = { width: 320, height: 300 };

export const FiftySpansOnAPhone = meta.story({
  args: {
    roots: manySpans(50),
    box: PHONE,
    showNames: false,
    lens: false,
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
    lens: false,
    barColor: "neutral",
    compress: false,
    showReadout: true,
  },
});

/** Past the floor: no-scroll breaks and the readout says so. */
export const FiveHundredSpansOverflowing = meta.story({
  args: {
    roots: manySpans(500),
    box: PHONE,
    showNames: false,
    lens: false,
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
    lens: false,
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
    lens: false,
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
    lens: false,
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
    lens: false,
    barColor: "neutral",
    compress: false,
    showReadout: true,
  },
});

/**
 * EXPERIMENTAL, and the subject of the next spike: rows near the pointer
 * magnify, borrowing their space from the rest so nothing scrolls. The idea
 * reads well and the maths hold — but the hit-test cannot be exact on this
 * substrate, so the row that expands is not reliably the one under the cursor.
 * It wants an invertible transform on a canvas/WebGL surface.
 */
export const LensExperiment = meta.story({
  args: {
    roots: manySpans(150),
    box: PHONE,
    showNames: false,
    lens: true,
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
    lens: false,
    barColor: "type",
    compress: true,
    showReadout: true,
  },
});

export const FitsWithoutScrolling = meta.story({
  name: "(Test) Fits Without Scrolling",
  args: {
    roots: manySpans(150),
    box: PHONE,
    showNames: false,
    lens: false,
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

    // The whole claim of this spike: neither axis scrolls.
    await expect(surface.scrollWidth).toBeLessThanOrEqual(surface.clientWidth);
    await expect(surface.scrollHeight).toBeLessThanOrEqual(
      surface.clientHeight,
    );

    const bars = canvasElement.querySelectorAll<HTMLElement>(
      '[data-testid="timeline-dense-bar"]',
    );
    // Every row is present, not just the ones a virtualizer mounted.
    await expect(bars.length).toBe(150);

    const surfaceRect = surface.getBoundingClientRect();
    for (const bar of bars) {
      const rect = bar.getBoundingClientRect();
      await expect(rect.right).toBeLessThanOrEqual(surfaceRect.right + 0.5);
      await expect(rect.height).toBeGreaterThan(0);
    }
  },
});

export const HoverOpensATooltip = meta.story({
  name: "(Test) Hover Opens A Tooltip",
  args: {
    roots: manySpans(150),
    box: PHONE,
    showNames: false,
    lens: false,
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
