import { type ComponentProps, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { TabBar } from "./TabBar";
const onUnpin = fn();
const onDiscard = fn();

const meta = preview.meta({
  component: TabBar,
  decorators: [
    (Story) => (
      <Tabs defaultValue="messages">
        <Story />
      </Tabs>
    ),
  ],
});

export const Default = meta.story({
  name: "(Test) View actions",
  args: {
    label: "Views",
    tabs: [
      { value: "messages", label: "Messages" },
      {
        value: "generations",
        label: "Generations",
        menu: {
          label: "Generations options",
          items: [
            { type: "item", id: "unpin", title: "Unpin", onClick: onUnpin },
          ],
        },
      },
      {
        value: "unsaved",
        label: "Unsaved view",
        menu: {
          label: "Unsaved view options",
          items: [
            {
              type: "item",
              id: "discard",
              title: "Discard",
              onClick: onDiscard,
            },
          ],
        },
      },
    ],
    createAction: { label: "Create custom view", onClick: fn() },
    manageAction: { label: "Manage views", onClick: fn() },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getAllByRole("tab").map((tab) => tab.textContent),
    ).toEqual(["Messages", "Generations", "Unsaved view"]);
    await expect(
      canvas.getByRole("button", { name: "Generations options" }),
    ).not.toBeVisible();
    canvas.getByRole("tab", { name: "Messages" }).focus();
    await userEvent.tab();
    await expect(
      canvas.getByRole("button", { name: "Generations options" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Generations options" }),
    );
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("menuitem", {
        name: "Unpin",
      }),
    );
    await expect(onUnpin).toHaveBeenCalledOnce();
    await expect(canvas.getByRole("tab", { name: "Messages" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.hover(canvas.getByRole("tab", { name: "Unsaved view" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Unsaved view options" }),
    );
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("menuitem", {
        name: "Discard",
      }),
    );
    await expect(onDiscard).toHaveBeenCalledOnce();
    await userEvent.click(
      canvas.getByRole("button", { name: "Create custom view" }),
    );
    await expect(args.createAction?.onClick).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole("button", { name: "Manage views" }));
    await expect(args.manageAction?.onClick).toHaveBeenCalledOnce();
  },
});

export const TraceViews = meta.story({
  args: {
    label: "Trace views",
    tabs: [
      { value: "trace", label: "Trace" },
      { value: "messages", label: "Messages", internal: true },
    ],
  },
});

export const Wide = Default.extend({
  name: "(Test) Wide manage action",
  decorators: [
    (Story) => (
      <div className="w-[640px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole("button", {
      name: "Manage views",
    });
    await expect(button).toHaveTextContent("Manage views");
    await userEvent.click(button);
    await expect(args.manageAction?.onClick).toHaveBeenCalledOnce();
  },
});

function SavedViewsLoadingLater(props: ComponentProps<typeof TabBar>) {
  const [loaded, setLoaded] = useState(false);
  const unsaved = props.tabs.filter((tab) => tab.value === "unsaved");
  const saved = props.tabs.filter((tab) => tab.value !== "unsaved");
  return (
    <>
      <TabBar
        {...props}
        tabs={
          loaded
            ? [...saved, { value: "errors", label: "Errors only" }, ...unsaved]
            : [saved[0]!, ...unsaved]
        }
      />
      <button type="button" onClick={() => setLoaded(true)}>
        Load saved views
      </button>
    </>
  );
}

export const SelectedTabRevealed = Default.extend({
  name: "(Test) Selected tab scrolled into view",
  decorators: [
    (Story) => (
      <div className="w-[320px]">
        <Tabs defaultValue="unsaved">
          <Story />
        </Tabs>
      </div>
    ),
  ],
  render: (args) => <SavedViewsLoadingLater {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Load saved views" }),
    );
    const tab = canvas.getByRole("tab", { name: "Unsaved view" });
    const scroller = tab.closest('[role="tablist"]')!.parentElement!;
    await expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth);
    // scrollLeft snaps to whole pixels, so allow a subpixel overshoot.
    await waitFor(() =>
      expect(tab.getBoundingClientRect().right).toBeLessThanOrEqual(
        scroller.getBoundingClientRect().right + 1,
      ),
    );
  },
});

export const Compact = Default.extend({
  name: "(Test) Compact manage action",
  decorators: [
    (Story) => (
      <div className="w-[320px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole("button", {
      name: "Manage views",
    });
    await expect(button).not.toHaveTextContent("Manage views");
    await userEvent.click(button);
    await expect(args.manageAction?.onClick).toHaveBeenCalledOnce();
  },
});
