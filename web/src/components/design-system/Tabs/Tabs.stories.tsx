import React from "react";
import { KeyRound, User } from "lucide-react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Tabs } from "./Tabs";

const meta = preview.meta({
  component: Tabs,
});

const defaultChildren = (
  <>
    <Tabs.List variant="inset" size="md">
      <Tabs.Trigger value="account" label="Account" />
      <Tabs.Trigger value="password" label="Password" />
    </Tabs.List>
    <Tabs.Content value="account">Account settings</Tabs.Content>
    <Tabs.Content value="password">Password settings</Tabs.Content>
  </>
);

const fullWidthChildren = (
  <>
    <Tabs.List variant="inset" size="md" layout="full">
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

const underlineChildren = (
  <>
    <Tabs.List variant="underline">
      <Tabs.Trigger value="first" label="First" />
      <Tabs.Trigger value="second" label="Second" />
    </Tabs.List>
    <Tabs.Content value="first">First panel</Tabs.Content>
    <Tabs.Content value="second">Second panel</Tabs.Content>
  </>
);

function ResizableSlidingTabs() {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="[&_[role=tablist]]:w-80 [&_[role=tablist]]:justify-start">
      <button type="button" onClick={() => setExpanded(true)}>
        Expand active tab
      </button>
      <Tabs defaultValue="first">
        <Tabs.List variant="inset" size="md">
          <span className={expanded ? "w-40" : "w-20"}>
            <Tabs.Trigger value="first" label="First" />
          </span>
          <Tabs.Trigger value="second" label="Second" />
        </Tabs.List>
      </Tabs>
    </div>
  );
}

function LinkTabs() {
  return (
    <Tabs.List variant="underline" aria-label="Page sections">
      <Tabs.Trigger href="/traces" active label="Traces" />
      <Tabs.Trigger href="/observations" active={false} label="Observations" />
      <Tabs.Trigger href="/sessions" active={false} disabled label="Sessions" />
    </Tabs.List>
  );
}

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
        <Tabs.List variant="inset" size="md">
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
        <Tabs.List variant="inset" size="md">
          <Tabs.Trigger value="account" icon={User} label="Account" />
          <Tabs.Trigger value="password" icon={KeyRound} label="Password" />
        </Tabs.List>
        <Tabs.Content value="account">Account settings</Tabs.Content>
        <Tabs.Content value="password">Password settings</Tabs.Content>
      </>
    ),
  },
});

export const Underline = meta.story({
  args: {
    defaultValue: "first",
    children: underlineChildren,
  },
});

/** Link tabs render outside a `Tabs` root: navigation, not a tablist. */
export const Links = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => <LinkTabs />,
});

export const VariantMatrix = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="grid gap-6">
      {(["sm", "md"] as const).map((size) => (
        <div key={size}>
          <div className="text-muted-foreground mb-2 text-sm">
            inset / {size}
          </div>
          <Tabs defaultValue="one">
            <Tabs.List variant="inset" size={size}>
              <Tabs.Trigger value="one" label="One" />
              <Tabs.Trigger value="two" label="Two" />
            </Tabs.List>
          </Tabs>
        </div>
      ))}
      <div>
        <div className="text-muted-foreground mb-2 text-sm">underline</div>
        <Tabs defaultValue="one">
          <Tabs.List variant="underline">
            <Tabs.Trigger value="one" label="One" />
            <Tabs.Trigger value="two" label="Two" />
          </Tabs.List>
        </Tabs>
      </div>
      <div>
        <div className="text-muted-foreground mb-2 text-sm">links</div>
        <LinkTabs />
      </div>
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
      <Tabs.List variant="inset" size="md">
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
      <Tabs.List variant="inset" size="md">
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

export const AlignsSlidingIndicatorInScaledContainer = meta.story({
  name: "(Test) Aligns Sliding Indicator In Scaled Container",
  args: {
    defaultValue: "short",
    children: (
      <Tabs.List variant="inset" size="md">
        <Tabs.Trigger value="short" label="Python" />
        <Tabs.Trigger value="long" label="TypeScript" />
      </Tabs.List>
    ),
  },
  render: (args) => (
    <div className="origin-top-left scale-75">
      <Tabs {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const activeTab = canvas.getByRole("tab", { name: "Python" });
    const indicator = canvasElement.querySelector("[data-tabs-indicator]");

    await expect(indicator).toBeInTheDocument();
    await waitFor(() => {
      const indicatorRect = indicator!.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();
      expect(Math.abs(indicatorRect.left - tabRect.left)).toBeLessThan(0.5);
      expect(Math.abs(indicatorRect.width - tabRect.width)).toBeLessThan(0.5);
    });
  },
});

export const KeepsUnderlineStyle = meta.story({
  name: "(Test) Keeps Underline Style",
  args: {
    defaultValue: "first",
    children: underlineChildren,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("tab", { name: "First" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      canvasElement.querySelector("[data-tabs-indicator]"),
    ).not.toBeInTheDocument();
  },
});

export const RendersLinksAsNavigation = meta.story({
  name: "(Test) Renders Links As Navigation",
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => <LinkTabs />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const active = canvas.getByRole("link", { name: "Traces" });

    await expect(active).toHaveAttribute("aria-current", "page");
    await expect(
      canvas.getByRole("link", { name: "Observations" }),
    ).not.toHaveAttribute("aria-current");
    await expect(canvas.queryByRole("tab")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("tablist")).not.toBeInTheDocument();
  },
});

export const TracksTriggerResize = meta.story({
  name: "(Test) Tracks Trigger Resize",
  render: () => <ResizableSlidingTabs />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const activeTab = canvas.getByRole("tab", { name: "First" });
    const indicator = canvasElement.querySelector("[data-tabs-indicator]");

    await expect(indicator).toBeInTheDocument();
    await waitFor(() => {
      expect(
        Math.abs(
          indicator!.getBoundingClientRect().width -
            activeTab.getBoundingClientRect().width,
        ),
      ).toBeLessThan(0.5);
    });
    const initialWidth = activeTab.getBoundingClientRect().width;
    await new Promise((resolve) => setTimeout(resolve, 100));

    await userEvent.click(
      canvas.getByRole("button", { name: "Expand active tab" }),
    );
    await waitFor(() => {
      const indicatorRect = indicator!.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();
      expect(tabRect.width).toBeGreaterThan(initialWidth);
      expect(Math.abs(indicatorRect.width - tabRect.width)).toBeLessThan(0.5);
    });
  },
});
