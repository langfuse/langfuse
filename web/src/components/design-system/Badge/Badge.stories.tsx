import React from "react";
import { ExternalLinkIcon } from "lucide-react";
import { expect } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Badge } from "./Badge";

type ComponentProps = React.ComponentProps<typeof Badge>;
type Color = NonNullable<ComponentProps["color"]>;
type Size = NonNullable<ComponentProps["size"]>;

const meta = preview.meta({
  component: Badge,
  args: {
    text: "Badge",
  },
});

const allColors = Object.keys({
  primary: true,
  neutral: true,
  red: true,
  yellow: true,
  blue: true,
  violet: true,
  teal: true,
  green: true,
} satisfies Record<Color, true>) as Color[];

const allSizes = Object.keys({
  default: true,
  sm: true,
} satisfies Record<Size, true>) as Size[];

export const Default = meta.story({});

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

export const VariantMatrix = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="grid grid-cols-[repeat(2,max-content)] items-center gap-3">
      {allColors.map((color) =>
        allSizes.map((size) => (
          <Badge
            key={`${color}-${size}`}
            color={color}
            size={size}
            text={`${color} / ${size}`}
          />
        )),
      )}
    </div>
  ),
});
