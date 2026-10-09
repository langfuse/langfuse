import React from "react";
import { cn } from "@/src/utils/tailwind";
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

const overflowTabs = [
  { value: "preview", label: "Preview" },
  { value: "messages", label: "Messages", internal: true },
  { value: "attributes", label: "Attributes" },
  { value: "scores", label: "Scores" },
  {
    value: "log",
    label: "Log View",
    tooltip: "Shows all observations concatenated.",
  },
];

const overflowTriggers = overflowTabs.map((tab) => (
  <Tabs.Trigger
    key={tab.value}
    value={tab.value}
    label={tab.label}
    internal={tab.internal}
    tooltip={tab.tooltip}
  />
));

const overflowPanels = overflowTabs.map((tab) => (
  <Tabs.Content key={tab.value} value={tab.value}>
    {tab.label} panel
  </Tabs.Content>
));

/** The row sits in a fixed-width box so each story shows one overflow case. */
function OverflowTabs({
  initialValue,
  width,
}: {
  initialValue: string;
  width: "w-40" | "w-sm" | "w-2xl";
}) {
  const [value, setValue] = React.useState(initialValue);

  return (
    <div className={width}>
      <Tabs value={value} onValueChange={setValue}>
        <div className="flex h-9 items-center border-b">
          <Tabs.List
            variant="underline"
            overflow="menu"
            aria-label="Detail views"
          >
            {overflowTriggers}
          </Tabs.List>
          <span className="text-muted-foreground shrink-0 px-2 text-xs">
            trailing
          </span>
        </div>
        {overflowPanels}
      </Tabs>
    </div>
  );
}

/**
 * Like the detail panels: a view toggle sits after the tabs except on Scores,
 * so picking Scores from the menu frees enough room for every tab and the
 * overflow trigger disappears.
 */
function OverflowTabsWithTrailing() {
  const [value, setValue] = React.useState("preview");

  return (
    <div className="w-xl">
      <Tabs value={value} onValueChange={setValue}>
        <div className="flex h-9 items-center border-b">
          <Tabs.List
            variant="underline"
            overflow="menu"
            aria-label="Detail views"
          >
            {overflowTriggers}
          </Tabs.List>
          <span
            className={cn(
              "text-muted-foreground w-64 shrink-0 px-2 text-xs",
              value === "scores" && "invisible",
            )}
          >
            trailing
          </span>
        </div>
        {overflowPanels}
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

const overflowStoryParameters = {
  controls: {
    disable: true,
  },
};

/** Wide enough for every tab: no overflow trigger. */
export const OverflowAllFit = meta.story({
  parameters: overflowStoryParameters,
  render: () => <OverflowTabs initialValue="preview" width="w-2xl" />,
});

/** Three tabs fit; Scores and Log View sit behind the overflow trigger. */
export const OverflowThreeFit = meta.story({
  parameters: overflowStoryParameters,
  render: () => <OverflowTabs initialValue="preview" width="w-sm" />,
});

/** The active Log View tab takes the last slot and displaces Attributes. */
export const OverflowActiveTab = meta.story({
  parameters: overflowStoryParameters,
  render: () => <OverflowTabs initialValue="log" width="w-sm" />,
});

/** Only the active tab fits next to the overflow trigger. */
export const OverflowOneFits = meta.story({
  parameters: overflowStoryParameters,
  render: () => <OverflowTabs initialValue="scores" width="w-40" />,
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

export const ShowsNoOverflowWhenTabsFit = meta.story({
  name: "(Test) Shows No Overflow When Tabs Fit",
  parameters: overflowStoryParameters,
  render: () => <OverflowTabs initialValue="preview" width="w-2xl" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getAllByRole("tab")).toHaveLength(5);
    await expect(
      canvas.queryByRole("button", { name: "More tabs" }),
    ).not.toBeInTheDocument();
  },
});

export const KeepsActiveTabVisibleInOverflow = meta.story({
  name: "(Test) Keeps Active Tab Visible In Overflow",
  parameters: overflowStoryParameters,
  render: () => <OverflowTabs initialValue="log" width="w-40" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const logTab = canvas.getByRole("tab", { name: "Log View" });
    const trigger = canvas.getByRole("button", { name: "More tabs" });

    await expect(logTab).toHaveAttribute("aria-selected", "true");
    await expect(canvas.queryByRole("tab", { name: "Preview" })).toBeNull();
    // The trigger shares the row with the tab instead of hanging below it.
    const tabRect = logTab.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    await expect(
      Math.abs(
        tabRect.top +
          tabRect.height / 2 -
          (triggerRect.top + triggerRect.height / 2),
      ),
    ).toBeLessThan(2);
  },
});

export const SelectsHiddenTabFromOverflowMenu = meta.story({
  name: "(Test) Selects Hidden Tab From Overflow Menu",
  parameters: overflowStoryParameters,
  render: () => <OverflowTabs initialValue="preview" width="w-40" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "More tabs" }));
    const messagesItem = await body.findByRole("menuitem", {
      name: /Messages/,
    });
    await expect(messagesItem).toHaveTextContent("Internal");

    await userEvent.click(body.getByRole("menuitem", { name: "Attributes" }));
    await waitFor(() => {
      expect(canvas.getByRole("tab", { name: "Attributes" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(canvas.queryByRole("tab", { name: "Preview" })).toBeNull();
    });
    await expect(canvas.getByText("Attributes panel")).toBeVisible();
  },
});

export const FocusesTabSelectedFromOverflowMenu = meta.story({
  name: "(Test) Focuses Tab Selected From Overflow Menu",
  parameters: overflowStoryParameters,
  render: () => <OverflowTabsWithTrailing />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const trigger = canvas.getByRole("button", { name: "More tabs" });

    await expect(canvas.queryByRole("tab", { name: "Scores" })).toBeNull();

    trigger.focus();
    await userEvent.keyboard("{Enter}");
    const scoresItem = await body.findByRole("menuitem", { name: "Scores" });
    scoresItem.focus();
    await userEvent.keyboard("{Enter}");

    // The trailing slot keeps its width, so Scores swaps into the row.
    await waitFor(() => {
      expect(canvas.getByRole("button", { name: "More tabs" })).toBeTruthy();
      expect(document.activeElement).toBe(
        canvas.getByRole("tab", { name: "Scores" }),
      );
    });
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
