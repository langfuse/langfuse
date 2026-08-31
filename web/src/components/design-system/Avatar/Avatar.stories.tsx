import React from "react";

import preview from "../../../../.storybook/preview";
import { Avatar } from "./Avatar";

type ComponentProps = React.ComponentProps<typeof Avatar>;
type Size = NonNullable<ComponentProps["size"]>;
type Shape = NonNullable<ComponentProps["shape"]>;
type FallbackTextSize = NonNullable<ComponentProps["fallbackTextSize"]>;
type FallbackBackground = NonNullable<ComponentProps["fallbackBackground"]>;

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

const allFallbackTextSizes = Object.keys({
  default: true,
  xs: true,
} satisfies Record<FallbackTextSize, true>) as FallbackTextSize[];

const allFallbackBackgrounds = Object.keys({
  muted: true,
  tertiary: true,
} satisfies Record<FallbackBackground, true>) as FallbackBackground[];

export const Default = meta.story({
  args: {
    alt: "Langfuse",
    fallback: "LF",
    src: "/apple-touch-icon.png",
  },
});

export const Fallback = meta.story({
  args: {
    fallback: "BB",
  },
});

export const TertiaryFallback = meta.story({
  args: {
    fallback: "BB",
    fallbackBackground: "tertiary",
    fallbackTextSize: "xs",
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
        gridTemplateColumns: `max-content repeat(${allShapes.length * allFallbackTextSizes.length * allFallbackBackgrounds.length}, max-content)`,
      }}
    >
      <div />
      {allShapes.map((shape) =>
        allFallbackTextSizes.map((fallbackTextSize) =>
          allFallbackBackgrounds.map((fallbackBackground) => (
            <div
              key={`${shape}-${fallbackTextSize}-${fallbackBackground}`}
              className="text-sm"
            >
              {shape} / {fallbackTextSize} / {fallbackBackground}
            </div>
          )),
        ),
      )}
      {allSizes.map((size) => (
        <React.Fragment key={size}>
          <div className="text-sm">{size}</div>
          {allShapes.map((shape) =>
            allFallbackTextSizes.map((fallbackTextSize) =>
              allFallbackBackgrounds.map((fallbackBackground) => (
                <Avatar
                  key={`${size}-${shape}-${fallbackTextSize}-${fallbackBackground}`}
                  fallback="LF"
                  fallbackBackground={fallbackBackground}
                  fallbackTextSize={fallbackTextSize}
                  shape={shape}
                  size={size}
                />
              )),
            ),
          )}
        </React.Fragment>
      ))}
    </div>
  ),
});
