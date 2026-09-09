import React from "react";
import { KeyRound, User } from "lucide-react";
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
  md: true,
  sm: true,
  auto: true,
} satisfies Record<ListSize, true>) as ListSize[];

const defaultChildren = (
  <>
    <Tabs.List>
      <Tabs.Trigger value="account" label="Account" />
      <Tabs.Trigger value="password" label="Password" />
    </Tabs.List>
    <Tabs.Content value="account">Account settings</Tabs.Content>
    <Tabs.Content value="password">Password settings</Tabs.Content>
  </>
);

const fullWidthChildren = (
  <>
    <Tabs.List layout="full">
      <span className="flex-1">
        <Tabs.Trigger value="first" label="First" />
      </span>
      <span className="flex-1">
        <Tabs.Trigger value="second" label="Second" />
      </span>
    </Tabs.List>
    <Tabs.Content value="first">First tab fills its wrapper.</Tabs.Content>
    <Tabs.Content value="second">Second tab fills its wrapper.</Tabs.Content>
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
          <Tabs.Trigger value="account" label="Account" />
          <Tabs.Trigger value="password" disabled label="Password" />
        </Tabs.List>
        <Tabs.Content value="account">Account settings</Tabs.Content>
        <Tabs.Content value="password">Password settings</Tabs.Content>
      </>
    ),
  },
});

export const FullWidth = meta.story({
  args: {
    defaultValue: "first",
    children: fullWidthChildren,
  },
});

export const WithIcons = meta.story({
  args: {
    defaultValue: "account",
    children: (
      <>
        <Tabs.List>
          <Tabs.Trigger value="account" icon={User} label="Account" />
          <Tabs.Trigger value="password" icon={KeyRound} label="Password" />
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
                  label="One"
                />
                <Tabs.Trigger
                  value="two"
                  variant={variant === "underline" ? "underline" : "default"}
                  size={size === "sm" ? "sm" : "default"}
                  label="Two"
                />
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

export const FillsWrappedTrigger = meta.story({
  name: "(Test) Fills Wrapped Trigger",
  args: {
    defaultValue: "first",
    children: fullWidthChildren,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const firstTab = canvas.getByRole("tab", { name: "First" });
    const wrapper = firstTab.parentElement;

    await expect(wrapper).toBeTruthy();
    await expect(
      Math.abs(
        firstTab.getBoundingClientRect().width -
          wrapper!.getBoundingClientRect().width,
      ),
    ).toBeLessThan(1);
  },
});

export const CentersWrappedTriggerVertically = meta.story({
  name: "(Test) Centers Wrapped Trigger Vertically",
  args: {
    defaultValue: "first",
    children: fullWidthChildren,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const firstTab = canvas.getByRole("tab", { name: "First" });
    const wrapper = firstTab.parentElement;
    const list = firstTab.closest('[role="tablist"]');

    await expect(wrapper).toBeTruthy();
    await expect(list).toBeTruthy();

    const listRect = list!.getBoundingClientRect();
    const tabRect = firstTab.getBoundingClientRect();
    const topInset = tabRect.top - listRect.top;
    const bottomInset = listRect.bottom - tabRect.bottom;

    await expect(Math.abs(topInset - bottomInset)).toBeLessThan(1);
  },
});

export const KeepsUnwrappedTriggersContentWidth = meta.story({
  name: "(Test) Keeps Unwrapped Triggers Content Width",
  args: {
    defaultValue: "short",
    children: (
      <Tabs.List variant="outline">
        <Tabs.Trigger value="short" label="Python" />
        <Tabs.Trigger value="long" label="TypeScript" />
      </Tabs.List>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shortTab = canvas.getByRole("tab", { name: "Python" });
    const longTab = canvas.getByRole("tab", { name: "TypeScript" });

    await expect(longTab.getBoundingClientRect().width).toBeGreaterThan(
      shortTab.getBoundingClientRect().width,
    );
  },
});

export const TruncatesLabel = meta.story({
  name: "(Test) Truncates Label",
  args: {
    defaultValue: "long",
    children: (
      <Tabs.List>
        <span className="w-20">
          <Tabs.Trigger
            value="long"
            label="A label that is too long for its trigger"
          />
        </span>
      </Tabs.List>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tab = canvas.getByRole("tab", {
      name: "A label that is too long for its trigger",
    });
    const label = within(tab).getByText(
      "A label that is too long for its trigger",
    );

    await expect(tab).toHaveAttribute(
      "title",
      "A label that is too long for its trigger",
    );
    await expect(label.scrollWidth).toBeGreaterThan(label.clientWidth);
  },
});
