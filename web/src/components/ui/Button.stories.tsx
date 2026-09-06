import React from "react";
import { PlusIcon } from "lucide-react";
import { fn } from "storybook/test";

import preview from "../../../.storybook/preview";
import { Button, type ButtonProps } from "./button";

type Variant = NonNullable<ButtonProps["variant"]>;
type Size = NonNullable<ButtonProps["size"]>;

const meta = preview.meta({
  component: Button,
});

const allVariants = Object.keys({
  default: true,
  destructive: true,
  "destructive-secondary": true,
  outline: true,
  "outline-success": true,
  secondary: true,
  tertiary: true,
  ghost: true,
  link: true,
  errorNotification: true,
} satisfies Record<Variant, true>) as Variant[];

const allSizes = Object.keys({
  default: true,
  xs: true,
  sm: true,
  lg: true,
  icon: true,
  "icon-xs": true,
  "icon-sm": true,
} satisfies Record<Size, true>) as Size[];

export const Default = meta.story({
  args: {
    children: "Button",
    onClick: fn(),
  },
});

export const WithIcon = meta.story({
  args: {
    children: (
      <>
        <PlusIcon className="h-4 w-4" aria-hidden="true" />
        Add item
      </>
    ),
    className: "gap-2",
    onClick: fn(),
  },
});

export const Disabled = meta.story({
  args: {
    children: "Button",
    disabled: true,
  },
});

export const Loading = meta.story({
  args: {
    children: "Button",
    loading: true,
  },
});

export const LoadingWithText = meta.story({
  args: {
    children: "Button",
    loading: true,
    loadingText: "Saving…",
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
      className="grid items-center gap-3"
      style={{
        gridTemplateColumns: `max-content repeat(${allVariants.length}, max-content)`,
      }}
    >
      <div />
      {allVariants.map((variant) => (
        <div key={variant} className="text-muted-foreground text-xs">
          {variant}
        </div>
      ))}
      {allSizes.map((size) => (
        <React.Fragment key={size}>
          <div className="text-muted-foreground text-xs">{size}</div>
          {allVariants.map((variant) => (
            <Button
              key={`${variant}-${size}`}
              variant={variant}
              size={size}
              aria-label={size.startsWith("icon") ? variant : undefined}
            >
              {size.startsWith("icon") ? (
                <PlusIcon className="h-3 w-3" aria-hidden="true" />
              ) : (
                "Button"
              )}
            </Button>
          ))}
        </React.Fragment>
      ))}
    </div>
  ),
});
