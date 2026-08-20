import { expect } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { TimelineScale } from "./TimelineScale";
import { TICK_LABEL_INSET_PX } from "../../fns/timeline/layout";

const meta = preview.meta({
  component: TimelineScale,
});

/** Ticks arrive already placed and labelled by layout(); see fns/timeline. */
const ticks = (stepMs: number, count: number, laneWidth: number) =>
  Array.from({ length: count }, (_, i) => ({
    realMs: i * stepMs,
    x: (i / count) * laneWidth,
    label:
      stepMs >= 1000
        ? `${((i * stepMs) / 1000).toFixed(2)}s`
        : `${i * stepMs}ms`,
  }));

export const Default = meta.story({
  args: { ticks: ticks(1000, 8, 700), laneWidth: 700 },
});

export const SubSecond = meta.story({
  args: { ticks: ticks(100, 8, 700), laneWidth: 700 },
});

export const NarrowLane = meta.story({
  args: { ticks: ticks(1000, 3, 240), laneWidth: 240 },
});

/**
 * The axis renders a label at the same distance from its tick line that `layout()`
 * reserves for it. There were three numbers for that one distance — a constant
 * here, a Tailwind class in the renderer, and a literal in the label's clamp — so
 * `fits()` was quietly stricter than the render and dropped ticks that would have
 * been whole. One number, asserted against what the DOM did with it.
 */
export const TheLabelSitsWhereLayoutReservedIt = meta.story({
  name: "(Test) The Label Sits Where Layout Reserved It",
  args: { ticks: ticks(1000, 6, 700), laneWidth: 700 },
  play: async ({ canvasElement }) => {
    const lane = canvasElement.querySelector<HTMLElement>(
      "div[style*='width']",
    );
    if (!lane) throw new Error("no lane");
    const labels = [...canvasElement.querySelectorAll<HTMLElement>("span")];
    await expect(labels.length).toBeGreaterThan(1);

    const laneBox = lane.getBoundingClientRect();
    for (const label of labels) {
      const line = label.parentElement!.getBoundingClientRect();
      const drawn = label.getBoundingClientRect();
      // Exactly the reserved inset from its own tick line...
      await expect(drawn.left - line.left).toBeCloseTo(TICK_LABEL_INSET_PX, 0);
      // ...and never past the lane, whatever the label says.
      await expect(drawn.right).toBeLessThanOrEqual(laneBox.right + 0.5);
    }
    // And the axis itself does not scroll — the same rule as everything else.
    await expect(lane.scrollWidth).toBeLessThanOrEqual(lane.clientWidth);
  },
});
