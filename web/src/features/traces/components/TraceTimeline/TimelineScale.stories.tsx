import preview from "../../../../../.storybook/preview";
import { TimelineScale } from "./TimelineScale";

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
