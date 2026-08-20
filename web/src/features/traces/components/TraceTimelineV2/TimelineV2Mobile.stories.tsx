import preview from "../../../../../.storybook/preview";
import { TimelineV2, type TimelineComposition } from "./TimelineV2";
import { reporterTrace } from "../../fns/timeline/__tests__/timelineV2.fixtures";

const meta = preview.meta({
  component: TimelineV2,
});

/**
 * Fit-to-box fixes the time axis. What still breaks below ~480px is the name
 * gutter and the chart sharing one row, so these are the takes on that.
 */
const PHONE = { width: 320, height: 300 };
const COMPOSITIONS: TimelineComposition[] = [
  "split",
  "icons",
  "overlay",
  "stacked",
  "modes",
];

export const GutterAndChart = meta.story({
  args: {
    roots: reporterTrace(),
    box: PHONE,
    pointer: "coarse",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const IconGutter = meta.story({
  args: {
    roots: reporterTrace(),
    box: PHONE,
    pointer: "coarse",
    compress: false,
    composition: "icons",
    showReadout: true,
  },
});

export const NamesOverBars = meta.story({
  args: {
    roots: reporterTrace(),
    box: PHONE,
    pointer: "coarse",
    compress: false,
    composition: "overlay",
    showReadout: true,
  },
});

export const NameAboveBar = meta.story({
  args: {
    roots: reporterTrace(),
    box: PHONE,
    pointer: "coarse",
    compress: false,
    composition: "stacked",
    showReadout: true,
  },
});

export const ModeToggle = meta.story({
  args: {
    roots: reporterTrace(),
    box: PHONE,
    pointer: "coarse",
    compress: false,
    composition: "modes",
    showReadout: true,
  },
});

/** All four takes side by side, at touch density. */
export const VariantMatrix = meta.story({
  args: {
    roots: reporterTrace(),
    box: PHONE,
    pointer: "coarse",
    compress: false,
    composition: "split",
    showReadout: true,
  },
  render: (args) => (
    <div className="flex flex-wrap gap-4">
      {COMPOSITIONS.map((composition) => (
        <div key={composition} className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">{composition}</span>
          <TimelineV2 {...args} composition={composition} />
        </div>
      ))}
    </div>
  ),
});
