import { TagIcon } from "lucide-react";
import React from "react";
import { expect, fn } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Tag } from "./Tag";

const meta = preview.meta({
  component: Tag,
  args: {
    text: "seed-embed-3-small",
  },
});

export const Default = meta.story({});

export const Removable = meta.story({
  args: {
    remove: { onRemove: fn() },
  },
});

export const Variants = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Tag text="default" />
      <Tag text="gpt-5" remove={{ onRemove: fn() }} />
      <Tag
        text="Regression"
        secondaryText="(current)"
        remove={{ onRemove: fn() }}
      />
      <Tag text="locked" remove={{ onRemove: fn(), disabled: true }} />
      <Tag text="release-notes" icon={TagIcon} />
      <Tag text="warning" status="warning" />
      <Tag text="error" status="error" />
    </div>
  ),
});

export const CenteredLabel = meta.story({
  name: "(Test) Centered Label",
  play: async ({ canvas, args }) => {
    const label = canvas.getByText(args.text);
    const chip = label.parentElement!;
    const range = document.createRange();
    range.selectNodeContents(label);

    const pill = chip.getBoundingClientRect();
    const text = range.getBoundingClientRect();
    const { borderTopWidth, borderBottomWidth } = getComputedStyle(chip);

    // Measured inside the border, so a border width change cannot mask a padding one.
    const above = text.top - (pill.top + parseFloat(borderTopWidth));
    const below = pill.bottom - parseFloat(borderBottomWidth) - text.bottom;

    // Precision 0 tolerates sub-pixel rounding but not a whole-pixel nudge.
    await expect(above).toBeCloseTo(below, 0);
  },
});
