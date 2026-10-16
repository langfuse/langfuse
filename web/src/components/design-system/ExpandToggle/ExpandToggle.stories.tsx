import { useState } from "react";
import { expect, fn, userEvent } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { ExpandToggle } from "./ExpandToggle";

type ExpandToggleProps = Parameters<typeof ExpandToggle>[0];

function StatefulExpandToggle(args: ExpandToggleProps) {
  const [expanded, setExpanded] = useState(args.expanded);
  const handleExpandedChange = (next: boolean) => {
    setExpanded(next);
    args.onExpandedChange(next);
  };

  return (
    <ExpandToggle
      {...args}
      expanded={expanded}
      onExpandedChange={handleExpandedChange}
    />
  );
}

const meta = preview.meta({
  component: ExpandToggle,
  args: { expanded: false, onExpandedChange: fn() },
  render: StatefulExpandToggle,
});

export const Plain = meta.story({
  args: { label: "Show more", expandedLabel: "Show less" },
});

export const Underline = meta.story({
  args: {
    variant: "underline",
    label: "Show all 15 templates",
    expandedLabel: "Show fewer",
  },
});

export const WithIcon = meta.story({
  args: {
    variant: "icon",
    label: "Show error details",
    expandedLabel: "Hide error details",
  },
});

export const Overview = meta.story({
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="grid w-fit grid-cols-[auto_auto_auto] items-center justify-items-start gap-x-8 gap-y-4 p-4 text-xs">
      <span className="text-muted-foreground" />
      <span className="text-muted-foreground">Collapsed</span>
      <span className="text-muted-foreground">Expanded</span>
      <span>plain</span>
      <ExpandToggle expanded={false} onExpandedChange={fn()} />
      <ExpandToggle expanded onExpandedChange={fn()} />
      <span>underline</span>
      <ExpandToggle
        expanded={false}
        onExpandedChange={fn()}
        variant="underline"
        label="Show all 15 templates"
      />
      <ExpandToggle
        expanded
        onExpandedChange={fn()}
        variant="underline"
        expandedLabel="Show fewer"
      />
      <span>icon</span>
      <ExpandToggle
        expanded={false}
        onExpandedChange={fn()}
        variant="icon"
        label="Show error details"
      />
      <ExpandToggle
        expanded
        onExpandedChange={fn()}
        variant="icon"
        expandedLabel="Hide error details"
      />
      <span>icon, right</span>
      <ExpandToggle
        expanded={false}
        onExpandedChange={fn()}
        variant="icon"
        iconPosition="right"
        label="Show error details"
      />
      <ExpandToggle
        expanded
        onExpandedChange={fn()}
        variant="icon"
        iconPosition="right"
        expandedLabel="Hide error details"
      />
      <span>size sm (13px)</span>
      <ExpandToggle expanded={false} onExpandedChange={fn()} size="sm" />
      <ExpandToggle expanded onExpandedChange={fn()} size="sm" />
    </div>
  ),
});

export const TogglesState = meta.story({
  name: "(Test) Flips label and aria-expanded",
  args: { label: "Show more", expandedLabel: "Show less" },
  play: async ({ canvas, args }) => {
    const toggle = canvas.getByRole("button", { name: "Show more" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    await expect(args.onExpandedChange).toHaveBeenCalledWith(true);
    await expect(
      canvas.getByRole("button", { name: "Show less" }),
    ).toHaveAttribute("aria-expanded", "true");
  },
});
