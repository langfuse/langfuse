import React from "react";
import { expect, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Tabs } from "./Tabs";

type ListVariant = NonNullable<
  React.ComponentProps<typeof Tabs.List>["variant"]
>;
type ListSize = NonNullable<React.ComponentProps<typeof Tabs.List>["size"]>;

const meta = preview.meta({
  component: Tabs,
});

const listVariants = Object.keys({
  default: true,
  underline: true,
  outline: true,
} satisfies Record<ListVariant, true>) as ListVariant[];

const listSizes = Object.keys({
  default: true,
  sm: true,
  auto: true,
} satisfies Record<ListSize, true>) as ListSize[];

const defaultChildren = (
  <>
    <Tabs.List>
      <Tabs.Trigger value="account">Account</Tabs.Trigger>
      <Tabs.Trigger value="password">Password</Tabs.Trigger>
    </Tabs.List>
    <Tabs.Content value="account">Account settings</Tabs.Content>
    <Tabs.Content value="password">Password settings</Tabs.Content>
  </>
);

export const Default = meta.story({
  args: {
    defaultValue: "account",
    children: defaultChildren,
  },
});

export const Disabled = meta.story({
  args: {
    defaultValue: "account",
    children: (
      <>
        <Tabs.List>
          <Tabs.Trigger value="account">Account</Tabs.Trigger>
          <Tabs.Trigger value="password" disabled>
            Password
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="account">Account settings</Tabs.Content>
        <Tabs.Content value="password">Password settings</Tabs.Content>
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
    <div className="grid gap-6">
      {listVariants.map((variant) =>
        listSizes.map((size) => (
          <div key={`${variant}-${size}`}>
            <div className="text-muted-foreground mb-2 text-sm">
              {variant} / {size}
            </div>
            <Tabs defaultValue="one">
              <Tabs.List variant={variant} size={size}>
                <Tabs.Trigger
                  value="one"
                  variant={variant === "underline" ? "underline" : "default"}
                  size={size === "sm" ? "sm" : "default"}
                >
                  One
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="two"
                  variant={variant === "underline" ? "underline" : "default"}
                  size={size === "sm" ? "sm" : "default"}
                >
                  Two
                </Tabs.Trigger>
              </Tabs.List>
            </Tabs>
          </div>
        )),
      )}
    </div>
  ),
});

export const SwitchesTab = meta.story({
  name: "(Test) Switches Tab",
  args: {
    defaultValue: "account",
    children: defaultChildren,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const passwordTab = canvas.getByRole("tab", { name: "Password" });

    await userEvent.click(passwordTab);
    await expect(passwordTab).toHaveAttribute("aria-selected", "true");
    await expect(canvas.getByText("Password settings")).toBeVisible();
  },
});
