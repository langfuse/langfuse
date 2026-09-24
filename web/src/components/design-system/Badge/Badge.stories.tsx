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
