import { expect, userEvent, waitFor } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { TimelineV2 } from "./TimelineV2";
import {
  TIMELINE_SHAPES,
  allInstantaneous,
  deepNesting,
  longTailTrace,
  manySpans,
  missingEndTimes,
  reporterTrace,
  singleSpan,
  threeSpans,
  zeroDurationTrace,
} from "./__tests__/timelineV2.fixtures";

const meta = preview.meta({
  component: TimelineV2,
});

/** A comfortable desktop lane; the size axis lives in TimelineV2Sizes. */
const DESKTOP = { width: 768, height: 420 };
/** Roughly the peek panel — the lane the community bug was reported in. */
const PEEK = { width: 320, height: 260 };

export const ReporterShape = meta.story({
  args: {
    roots: reporterTrace(),
    box: PEEK,
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const SingleSpan = meta.story({
  args: {
    roots: singleSpan(),
    box: DESKTOP,
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const ThreeSpans = meta.story({
  args: {
    roots: threeSpans(),
    box: DESKTOP,
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const DeepNesting = meta.story({
  args: {
    roots: deepNesting(12),
    box: DESKTOP,
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const FiveHundredSpans = meta.story({
  args: {
    roots: manySpans(500),
    box: DESKTOP,
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const TenThousandSpans = meta.story({
  args: {
    roots: manySpans(10_000),
    box: DESKTOP,
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const LongTail = meta.story({
  args: {
    roots: longTailTrace(),
    box: DESKTOP,
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const AllInstantaneous = meta.story({
  args: {
    roots: allInstantaneous(),
    box: DESKTOP,
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const MissingEndTimes = meta.story({
  args: {
    roots: missingEndTimes(),
    box: DESKTOP,
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const ZeroDuration = meta.story({
  args: {
    roots: zeroDurationTrace(),
    box: DESKTOP,
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const CoarsePointer = meta.story({
  args: {
    roots: reporterTrace(),
    box: DESKTOP,
    pointer: "coarse",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

/** Every shape in the peek-width lane — the column that matters most. */
export const VariantMatrix = meta.story({
  args: {
    roots: reporterTrace(),
    box: PEEK,
    pointer: "fine",
    compress: true,
    composition: "split",
    showReadout: true,
  },
  render: (args) => (
    <div className="flex flex-wrap gap-4">
      {Object.entries(TIMELINE_SHAPES).map(([shape, makeRoots]) => (
        <div key={shape} className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">{shape}</span>
          <TimelineV2 {...args} roots={makeRoots()} />
        </div>
      ))}
    </div>
  ),
});

export const FitsTheBox = meta.story({
  name: "(Test) Fits The Box",
  args: {
    roots: reporterTrace(),
    box: PEEK,
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
  play: async ({ canvasElement }) => {
    const scroll = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-v2-scroll"]',
    );
    if (!scroll) throw new Error("timeline scroll container not found");

    // The invariant the community bug is about: nothing to scroll sideways to.
    await expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth);

    const lane = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-v2-lane"]',
    );
    const bars = canvasElement.querySelectorAll<HTMLElement>(
      '[data-testid="timeline-v2-bar"]',
    );
    if (!lane) throw new Error("timeline lane not found");
    await expect(bars.length).toBeGreaterThan(0);

    const laneRect = lane.getBoundingClientRect();
    for (const bar of bars) {
      const rect = bar.getBoundingClientRect();
      await expect(rect.left).toBeGreaterThanOrEqual(laneRect.left - 0.5);
      await expect(rect.right).toBeLessThanOrEqual(laneRect.right + 0.5);
      await expect(rect.width).toBeGreaterThan(0);
    }
  },
});

export const ZoomsToASpan = meta.story({
  name: "(Test) Zooms To A Span",
  args: {
    roots: reporterTrace(),
    box: PEEK,
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
  play: async ({ canvasElement }) => {
    const readout = () =>
      canvasElement.querySelector<HTMLElement>(
        '[data-testid="timeline-v2-readout"]',
      )?.textContent ?? "";

    await expect(readout()).toContain("view 0ms–486ms");

    const bars = canvasElement.querySelectorAll<HTMLElement>(
      '[data-testid="timeline-v2-bar"]',
    );
    const chatGroq = bars[4];
    if (!chatGroq) throw new Error("expected a bar to double-click");
    await userEvent.dblClick(chatGroq);

    // Double-tap-to-fit narrows the window instead of scrolling a canvas.
    await waitFor(() => expect(readout()).not.toContain("view 0ms–486ms"));
  },
});
