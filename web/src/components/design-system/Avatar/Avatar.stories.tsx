import React from "react";

import preview from "../../../../.storybook/preview";
import { Avatar } from "./Avatar";

type ComponentProps = React.ComponentProps<typeof Avatar>;
type Size = NonNullable<ComponentProps["size"]>;
type Shape = NonNullable<ComponentProps["shape"]>;

const meta = preview.meta({
  component: Avatar,
});

const allSizes = Object.keys({
  sm: true,
  md: true,
  lg: true,
} satisfies Record<Size, true>) as Size[];

const allShapes = Object.keys({
  circle: true,
  rounded: true,
} satisfies Record<Shape, true>) as Shape[];

export const Default = meta.story({
  args: {
    displayName: "Langfuse",
    src: "/apple-touch-icon.png",
  },
});

export const Fallback = meta.story({
  args: {
    displayName: "Ben Bachem",
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
      className="grid items-center gap-4"
      style={{
        gridTemplateColumns: `max-content repeat(${allShapes.length}, max-content)`,
      }}
    >
      <div />
      {allShapes.map((shape) => (
        <div key={shape} className="text-sm">
          {shape}
        </div>
      ))}
      {allSizes.map((size) => (
        <React.Fragment key={size}>
          <div className="text-sm">{size}</div>
          {allShapes.map((shape) => (
            <Avatar
              key={`${size}-${shape}`}
              displayName="Lang Fuse"
              shape={shape}
              size={size}
            />
          ))}
        </React.Fragment>
      ))}
    </div>
  ),
});
