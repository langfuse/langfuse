import React from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Alert } from "./Alert";

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

const dismissibleChildren = (
  <>
    <button
      type="button"
      className="absolute top-2.5 right-2.5 grid size-7 cursor-pointer place-items-center rounded-sm border-none bg-transparent"
      aria-label="Dismiss alert"
      onClick={dismiss}
    >
      <X className="size-4" aria-hidden="true" />
    </button>
    <Alert.Title>Review required</Alert.Title>
    <Alert.Description>Check this warning before continuing.</Alert.Description>
  </>
);

export const Default = meta.story({
  args: {
    icon: Info,
    children: (
      <>
        <Alert.Title>Information</Alert.Title>
        <Alert.Description>This is an informational alert.</Alert.Description>
      </>
    ),
  },
});

export const Iconless = meta.story({
  args: {
    children: (
      <>
        <Alert.Title>Information</Alert.Title>
        <Alert.Description>This alert has no leading icon.</Alert.Description>
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
          <Alert
            key={`${variant}-${size}`}
            variant={variant}
            size={size}
            icon={AlertTriangle}
          >
            <Alert.Title>
              {variant} / {size}
            </Alert.Title>
            <Alert.Description>
              Alert content remains composable across variants and sizes.
            </Alert.Description>
          </Alert>
        )),
      )}
    </div>
  ),
});

export const DismissAction = meta.story({
  name: "(Test) Dismiss Action",
  args: {
    actionPosition: "top-right",
    children: dismissibleChildren,
    icon: AlertTriangle,
    variant: "warning",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const alert = canvas.getByRole("alert");
    const icon = alert.querySelector('[data-slot="alert-icon"]');
    const dismissButton = canvas.getByRole("button", { name: "Dismiss alert" });

    await expect(alert).toHaveClass("pr-10");
    await expect(alert.className).not.toContain("[&>svg");
    await expect(alert).toHaveClass(
      "[&>[data-slot=alert-icon]]:top-3",
      "[&>[data-slot=alert-icon]]:left-3",
    );
    await expect(icon).toHaveClass("absolute", "size-4");
    await expect(icon).toHaveAttribute("aria-hidden", "true");
    await expect(dismissButton).not.toHaveClass("pl-6");
    await userEvent.click(dismissButton);
    await expect(dismiss).toHaveBeenCalledOnce();
  },
});
