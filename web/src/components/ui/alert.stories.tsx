import React from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { Alert, AlertDescription, AlertTitle } from "./alert";

type Variant = NonNullable<React.ComponentProps<typeof Alert>["variant"]>;
type Size = NonNullable<React.ComponentProps<typeof Alert>["size"]>;

const meta = preview.meta({
  component: Alert,
});

const variants = Object.keys({
  default: true,
  destructive: true,
  info: true,
  warning: true,
} satisfies Record<Variant, true>) as Variant[];

const sizes = Object.keys({
  default: true,
  sm: true,
} satisfies Record<Size, true>) as Size[];

const dismiss = fn();

export const Default = meta.story({
  args: {
    children: (
      <>
        <Info className="h-4 w-4" />
        <AlertTitle>Information</AlertTitle>
        <AlertDescription>This is an informational alert.</AlertDescription>
      </>
    ),
  },
});

export const VariantMatrix = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="grid w-[600px] gap-4">
      {variants.map((variant) =>
        sizes.map((size) => (
          <Alert key={`${variant}-${size}`} variant={variant} size={size}>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {variant} / {size}
            </AlertTitle>
            <AlertDescription>
              Alert content remains composable across variants and sizes.
            </AlertDescription>
          </Alert>
        )),
      )}
    </div>
  ),
});

export const DismissAction = meta.story({
  name: "(Test) Dismiss Action",
  args: {
    children: null,
    dismissible: true,
    variant: "warning",
  },
  render: (args) => (
    <Alert {...args}>
      <button
        type="button"
        className="absolute top-2.5 right-2.5 grid size-7 cursor-pointer place-items-center rounded-sm border-none bg-transparent"
        aria-label="Dismiss alert"
        onClick={dismiss}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Review required</AlertTitle>
      <AlertDescription>Check this warning before continuing.</AlertDescription>
    </Alert>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("alert")).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Dismiss alert" }),
    );
    await expect(dismiss).toHaveBeenCalledOnce();
  },
});
