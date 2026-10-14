import React from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

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

export const WithEmail = meta.story({
  args: {
    displayName: "Ada Lovelace",
    email: "ada@example.com",
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

export const TestHoverNameAndEmail = meta.story({
  name: "(Test) Hover shows name and email",
  args: {
    displayName: "Ada Lovelace",
    email: "ada@example.com",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const avatar = canvas.getByRole("img", {
      name: "Ada Lovelace, ada@example.com",
    });

    await userEvent.hover(avatar);
    await waitFor(
      () =>
        expect(body.getByRole("tooltip")).toHaveTextContent(
          "Ada Lovelace ada@example.com",
        ),
      { timeout: 2000 },
    );
  },
});
