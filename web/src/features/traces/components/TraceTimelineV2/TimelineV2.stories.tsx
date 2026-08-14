import { useState } from "react";
import { expect, userEvent, waitFor } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { TimelineV2, type TimelineV2Props } from "./TimelineV2";
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

export const ClickSelectsARow = meta.story({
  name: "(Test) Click Selects A Row",
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
    const row = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-v2-content"] > div',
    );
    if (!scroll || !row) throw new Error("timeline row not found");

    // Pointer capture retargets the derived click to the capture element, so
    // capturing on pointerdown silently kills row selection. userEvent's
    // synthetic events ignore capture and cannot see that, so assert the
    // handler's contract directly: a press that does not move must not capture.
    const captured: number[] = [];
    scroll.setPointerCapture = (pointerId: number) => {
      captured.push(pointerId);
    };
    const press = (type: string, clientX: number) =>
      scroll.dispatchEvent(
        new PointerEvent(type, { pointerId: 1, clientX, bubbles: true }),
      );

    press("pointerdown", 100);
    press("pointermove", 102);
    press("pointerup", 102);
    await expect(captured).toHaveLength(0);

    press("pointerdown", 100);
    press("pointermove", 160);
    await expect(captured).toHaveLength(1);
    press("pointerup", 160);

    await userEvent.click(row);
    await waitFor(() =>
      expect(row.className).toContain("bg-primary-accent/10"),
    );
  },
});

export const DraggingMovesContentWithThePointer = meta.story({
  name: "(Test) Dragging Moves Content With The Pointer",
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
    if (!scroll) throw new Error("timeline scroll not found");
    const readout = () =>
      canvasElement.querySelector<HTMLElement>(
        '[data-testid="timeline-v2-readout"]',
      )?.textContent ?? "";
    const viewStart = () => {
      const match = /view (\d+)ms/.exec(readout());
      if (!match) throw new Error(`no view window in "${readout()}"`);
      return Number(match[1]);
    };

    // Zoom into the LAST span to start, so the window has somewhere to go in
    // both directions — zooming one that starts at the origin leaves the window
    // pinned to 0 and a leftward drag with nothing to prove.
    const bars = [
      ...canvasElement.querySelectorAll<HTMLElement>(
        '[data-testid="timeline-v2-bar"]',
      ),
    ];
    const target = bars.reduce<HTMLElement | null>(
      (latest, bar) =>
        !latest ||
        bar.getBoundingClientRect().left > latest.getBoundingClientRect().left
          ? bar
          : latest,
      null,
    );
    if (!target) throw new Error("expected a bar to double-click");
    await userEvent.dblClick(target);
    await waitFor(() => expect(viewStart()).toBeGreaterThan(0));

    const pointer = (type: string, clientX: number, pointerId = 1) =>
      scroll.dispatchEvent(
        new PointerEvent(type, { pointerId, clientX, bubbles: true }),
      );

    // Grab and drag RIGHT: the moment under the cursor has to come with it, which
    // means the window moves EARLIER. The other sign slides the bars against the
    // finger, which is the one thing a drag-to-pan must never do.
    const startedAt = viewStart();
    pointer("pointerdown", 200);
    pointer("pointermove", 260);
    pointer("pointerup", 260);
    await waitFor(() => expect(viewStart()).toBeLessThan(startedAt));

    const afterDragRight = viewStart();
    pointer("pointerdown", 260);
    pointer("pointermove", 200);
    pointer("pointerup", 200);
    await waitFor(() => expect(viewStart()).toBeGreaterThan(afterDragRight));

    // Lifting one finger of a two-finger pinch leaves the gesture live. The
    // survivor's next move must pan from where IT is, not jump by the finger
    // separation it inherited from the finger that left.
    const beforeRelease = viewStart();
    pointer("pointerdown", 100, 1);
    pointer("pointerdown", 260, 2);
    pointer("pointerup", 260, 2);
    // 1px is under the drag threshold, so re-anchored this does nothing at all;
    // inheriting the departed finger's 260 makes it a 159px pan instead.
    pointer("pointermove", 101, 1);
    await expect(viewStart()).toBe(beforeRelease);
    pointer("pointerup", 101, 1);
  },
});

/** Compression under the user's thumb, so a story can change it mid-zoom. */
function WithCompressionToggle(props: TimelineV2Props) {
  const [compress, setCompress] = useState(props.compress);
  return (
    <div className="flex flex-col items-start gap-1">
      <button type="button" onClick={() => setCompress((on) => !on)}>
        toggle compression
      </button>
      <TimelineV2 {...props} compress={compress} />
    </div>
  );
}

export const CompressionChangeDropsTheView = meta.story({
  name: "(Test) Compression Change Drops The View",
  args: {
    roots: longTailTrace(),
    box: PEEK,
    pointer: "fine",
    compress: true,
    composition: "split",
    showReadout: true,
  },
  render: (args) => <WithCompressionToggle {...args} />,
  play: async ({ canvasElement }) => {
    const readout = () =>
      canvasElement.querySelector<HTMLElement>(
        '[data-testid="timeline-v2-readout"]',
      )?.textContent ?? "";

    const bars = canvasElement.querySelectorAll<HTMLElement>(
      '[data-testid="timeline-v2-bar"]',
    );
    const target = bars[bars.length - 1];
    if (!target) throw new Error("expected a bar to double-click");
    // Zoom onto the last span, so the window starts well after the origin.
    await expect(readout()).toContain("view 0ms–");
    await userEvent.dblClick(target);
    await waitFor(() => expect(readout()).not.toContain("view 0ms–"));

    // A zoomed window is expressed in COMPRESSED ms. Turning compression off
    // replaces the space those numbers live in, so keeping them would draw an
    // unrelated window instead of an obviously broken one.
    const toggle = canvasElement.querySelector("button");
    if (!toggle) throw new Error("expected the compression toggle");
    await userEvent.click(toggle);
    await waitFor(() => expect(readout()).toContain("view 0ms–"));
  },
});

export const DoubleClickingTheChevronDoesNotZoom = meta.story({
  name: "(Test) Double Clicking The Chevron Does Not Zoom",
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
    const chevron = canvasElement.querySelector<HTMLElement>(
      'button[aria-label="Collapse"], button[aria-label="Expand"]',
    );
    if (!chevron) throw new Error("expected a collapse chevron");

    const before = readout();
    await userEvent.dblClick(chevron);
    // Collapsing twice is a no-op you cannot see, so a jumped view would be the
    // only visible result of an impatient click on the chevron.
    await expect(readout()).toBe(before);
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
