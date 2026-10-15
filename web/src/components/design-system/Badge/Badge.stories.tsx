import React from "react";
import { ExternalLinkIcon } from "lucide-react";
import { expect } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Badge } from "./Badge";

type ComponentProps = React.ComponentProps<typeof Badge>;
type Color = NonNullable<ComponentProps["color"]>;

const meta = preview.meta({
  component: Badge,
  args: {
    text: "Badge",
  },
});

const allColors = Object.keys({
  primary: true,
  red: true,
  yellow: true,
  blue: true,
  violet: true,
  teal: true,
  green: true,
  ghost: true,
  filled: true,
  filledOnMuted: true,
  violetTint: true,
  skyTint: true,
  emeraldTint: true,
  amberTint: true,
  pinkTint: true,
  indigoTint: true,
  tealTint: true,
  orangeTint: true,
  limeTint: true,
  fuchsiaTint: true,
  inverted: true,
} satisfies Record<Color, true>) as Color[];

export const Default = meta.story({});

export const WithDescenders = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge
        text="gpt-5"
        trailingIcon={ExternalLinkIcon}
        trailingIconTone="link"
      />
      <Badge
        text="Prompt: langfuse-docs-assistant-chat - v27"
        trailingIcon={ExternalLinkIcon}
      />
    </div>
  ),
});

export const WithTrailingIcon = meta.story({
  name: "(Test) With Trailing Icon",
  args: {
    text: "Linked badge",
    trailingIcon: ExternalLinkIcon,
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("svg")).not.toBeNull();
  },
});

export const Small = meta.story({
  args: { text: "DEBUG", size: "sm" },
});

export const Large = meta.story({
  args: { text: "# 16", size: "lg", color: "inverted", font: "mono" },
});

export const GhostInteractive = meta.story({
  args: {
    color: "ghost",
    interactive: true,
    label: "cost",
    text: "$0.0042",
  },
});

export const VariantMatrix = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="grid grid-cols-[repeat(2,max-content)] items-center gap-3">
      {allColors.map((color) => (
        <Badge key={color} color={color} text={color} />
      ))}
    </div>
  ),
});

export const LongWrappedLabel = meta.story({
  name: "(Test) Long Wrapped Label",
  args: {
    text: "Quality dashboard widgets and score distribution",
    shouldWrap: true,
  },
  render: (args) => (
    <div className="w-36">
      <Badge {...args} />
    </div>
  ),
  play: async ({ canvas, args }) => {
    const label = canvas.getByText(args.text);
    const badge = label.parentElement!;
    const range = document.createRange();
    range.selectNodeContents(label);
    const lines = Array.from(range.getClientRects());
    await expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      await expect(line.right).toBeLessThanOrEqual(
        badge.getBoundingClientRect().right,
      );
      await expect(line.bottom).toBeLessThanOrEqual(
        badge.getBoundingClientRect().bottom,
      );
    }
  },
});
