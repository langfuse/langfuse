import React from "react";
import { fn } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { Switch } from "./Switch";

type ComponentProps = React.ComponentProps<typeof Switch>;
type Size = NonNullable<ComponentProps["size"]>;
type Color = NonNullable<ComponentProps["color"]>;

const meta = preview.meta({
  component: Switch,
  args: {
    onCheckedChange: fn(),
  },
});

const allSizes = Object.keys({
  default: true,
  sm: true,
} satisfies Record<Size, true>) as Size[];

const allColors = Object.keys({
  default: true,
  green: true,
} satisfies Record<Color, true>) as Color[];

export const Default = meta.story({});

export const Checked = meta.story({
  args: {
    defaultChecked: true,
  },
});

export const Disabled = meta.story({
  args: {
    disabled: true,
    defaultChecked: true,
  },
});

export const Small = meta.story({
  args: {
    size: "sm",
  },
});

export const VariantMatrix = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(2, max-content)" }}
    >
      {allSizes.map((size) =>
        allColors.map((color) => (
          <div key={`${size}-${color}`} className="flex items-center gap-3">
            <Switch
              size={size}
              color={color}
              defaultChecked
              onCheckedChange={fn()}
            />
            <div className="text-sm">
              {size} / {color}
            </div>
          </div>
        )),
      )}
    </div>
  ),
});
