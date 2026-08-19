import preview from "../../../../../.storybook/preview";
import { TimelineV2 } from "./TimelineV2";
import {
  longTailTrace,
  manySpans,
} from "../../fns/timeline/__tests__/timelineV2.fixtures";

const meta = preview.meta({
  component: TimelineV2,
});

const PEEK = { width: 320, height: 260 };
const DESKTOP = { width: 1280, height: 360 };

/**
 * One 36s span, three 40ms spans. Fitted honestly the work is invisible;
 * compressed it is legible but the axis no longer reads linearly. Both halves
 * of the trade-off, same shape, same box.
 */
export const LongTailHonest = meta.story({
  args: {
    roots: longTailTrace(),
    box: PEEK,
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const LongTailCompressed = meta.story({
  args: {
    roots: longTailTrace(),
    box: PEEK,
    pointer: "fine",
    compress: true,
    composition: "split",
    showReadout: true,
  },
});

export const LongTailHonestWide = meta.story({
  args: {
    roots: longTailTrace(),
    box: DESKTOP,
    pointer: "fine",
    compress: false,
    composition: "split",
    showReadout: true,
  },
});

export const LongTailCompressedWide = meta.story({
  args: {
    roots: longTailTrace(),
    box: DESKTOP,
    pointer: "fine",
    compress: true,
    composition: "split",
    showReadout: true,
  },
});

/** A dense trace with no real idle stretch: compression should do nothing. */
export const DenseTraceCompressed = meta.story({
  args: {
    roots: manySpans(500),
    box: DESKTOP,
    pointer: "fine",
    compress: true,
    composition: "split",
    showReadout: true,
  },
});
