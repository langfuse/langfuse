import { expect } from "storybook/test";

import preview from "../../../.storybook/preview";
import { Badge } from "./badge";

const meta = preview.meta({
  component: Badge,
  args: {
    children: "Badge",
  },
});

export const Default = meta.story({});

export const CenteredLabel = meta.story({
  name: "(Test) Centered Label",
  play: async ({ canvas, args }) => {
    const badge = canvas.getByText(args.children as string);
    const range = document.createRange();
    range.selectNodeContents(badge);

    const pill = badge.getBoundingClientRect();
    const text = range.getBoundingClientRect();
    const { borderTopWidth, borderBottomWidth } = getComputedStyle(badge);

    // Measured inside the border, so a border width change cannot mask a padding one.
    const above = text.top - (pill.top + parseFloat(borderTopWidth));
    const below = pill.bottom - parseFloat(borderBottomWidth) - text.bottom;

    // Precision 0 tolerates sub-pixel rounding but not a whole-pixel nudge.
    await expect(above).toBeCloseTo(below, 0);
  },
});
