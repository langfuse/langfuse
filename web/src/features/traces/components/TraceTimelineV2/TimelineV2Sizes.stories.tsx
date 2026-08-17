import preview from "../../../../../.storybook/preview";
import { TimelineV2 } from "./TimelineV2";
import { reporterTrace } from "./__tests__/timelineV2.fixtures";

const meta = preview.meta({
  component: TimelineV2,
});

/** The five review widths; short and tall so density resolution is visible too. */
const WIDTHS = [320, 480, 768, 1280, 1920];
const SHORT = 220;
const TALL = 560;

export const Narrow320Short = meta.story({
  args: {
    roots: reporterTrace(),
    box: { width: 320, height: SHORT },
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const Narrow320Tall = meta.story({
  args: {
    roots: reporterTrace(),
    box: { width: 320, height: TALL },
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const Mobile480Short = meta.story({
  args: {
    roots: reporterTrace(),
    box: { width: 480, height: SHORT },
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const Mobile480Tall = meta.story({
  args: {
    roots: reporterTrace(),
    box: { width: 480, height: TALL },
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const Tablet768Short = meta.story({
  args: {
    roots: reporterTrace(),
    box: { width: 768, height: SHORT },
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const Tablet768Tall = meta.story({
  args: {
    roots: reporterTrace(),
    box: { width: 768, height: TALL },
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const Desktop1280Short = meta.story({
  args: {
    roots: reporterTrace(),
    box: { width: 1280, height: SHORT },
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const Desktop1280Tall = meta.story({
  args: {
    roots: reporterTrace(),
    box: { width: 1280, height: TALL },
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const Wide1920Short = meta.story({
  args: {
    roots: reporterTrace(),
    box: { width: 1920, height: SHORT },
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const Wide1920Tall = meta.story({
  args: {
    roots: reporterTrace(),
    box: { width: 1920, height: TALL },
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

/** Every width at once: the same trace, whole, in each box. */
export const VariantMatrix = meta.story({
  args: {
    roots: reporterTrace(),
    box: { width: 320, height: 300 },
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
  render: (args) => (
    <div className="flex flex-col gap-4">
      {WIDTHS.map((width) => (
        <div key={width} className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">{width}px</span>
          <TimelineV2 {...args} box={{ width, height: 300 }} />
        </div>
      ))}
    </div>
  ),
});
