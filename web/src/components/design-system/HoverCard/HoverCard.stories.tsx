import * as React from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { HoverCard } from "./HoverCard";
import { ControlledHoverCard } from "../ControlledHoverCard/ControlledHoverCard";
import { HoverCardController } from "../HoverCardController/HoverCardController";

const meta = preview.meta({
  component: HoverCard,
  args: {
    children: () => null,
    content: (
      <div className="w-64 space-y-2 p-3">
        <p className="font-bold">Preview details</p>
        <button type="button" onClick={fn()}>
          Copy details
        </button>
      </div>
    ),
    openDelay: 0,
    closeDelay: 100,
  },
  render: (args) => (
    <HoverCard {...args}>
      {({ getTriggerProps }) => (
        <button type="button" {...getTriggerProps()}>
          Show preview
        </button>
      )}
    </HoverCard>
  ),
});

export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.hover(canvas.getByRole("button", { name: "Show preview" }));
    const card = await body.findByRole("dialog");
    await expect(card.firstElementChild).toHaveClass(
      "bg-popover",
      "border",
      "shadow-md",
    );
    await expect(card.querySelectorAll(".bg-popover")).toHaveLength(1);
  },
});

export const CustomSurface = meta.story({
  args: {
    content: (
      <div className="bg-muted w-64 rounded-md p-3 shadow-md">
        A custom surface, composed without the default card frame.
      </div>
    ),
  },
  render: function CustomSurfaceExample(args) {
    const [open, setOpen] = React.useState(false);
    return (
      <HoverCardController {...args} open={open} onOpenChange={setOpen}>
        {({ getTriggerProps }) => (
          <button type="button" {...getTriggerProps()}>
            Show preview
          </button>
        )}
      </HoverCardController>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.hover(canvas.getByRole("button", { name: "Show preview" }));
    const card = await body.findByRole("dialog");
    await expect(card).toHaveTextContent(
      "A custom surface, composed without the default card frame.",
    );
    await expect(card.querySelector(".bg-popover")).toBeNull();
  },
});

export const HoverableContent = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Show preview" });

    await userEvent.hover(trigger);
    const action = await body.findByRole("button", { name: "Copy details" });
    await userEvent.unhover(trigger);
    await userEvent.hover(action);
    await userEvent.click(action);
    await expect(body.getByRole("dialog")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  },
});

export const KeyboardNavigation = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.tab();
    await expect(
      canvas.getByRole("button", { name: "Show preview" }),
    ).toHaveFocus();
    await body.findByRole("dialog");
    await userEvent.tab();
    await expect(
      body.getByRole("button", { name: "Copy details" }),
    ).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  },
});

export const Delayed = meta.story({
  args: { openDelay: 700, closeDelay: 300 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.hover(canvas.getByRole("button", { name: "Show preview" }));
    await expect(body.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(
      await body.findByRole("dialog", {}, { timeout: 2000 }),
    ).toHaveTextContent("Preview details");
  },
});

export const ControlledClosed = meta.story({
  name: "(Test) Controlled state stays closed",
  args: { onOpenChange: fn() },
  render: (args) => (
    <ControlledHoverCard
      {...args}
      open={false}
      onOpenChange={(open) => args.onOpenChange?.(open)}
    >
      {({ getTriggerProps }) => (
        <button type="button" {...getTriggerProps()}>
          Show preview
        </button>
      )}
    </ControlledHoverCard>
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.hover(canvas.getByRole("button", { name: "Show preview" }));
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(true));
    await expect(body.queryByRole("dialog")).not.toBeInTheDocument();
  },
});

export const TriggerRefAndClickHandler = meta.story({
  name: "(Test) Trigger ref and click handler are merged",
  render: function TriggerRefExample(args) {
    const ref = React.useRef<HTMLButtonElement>(null);
    const [clickResult, setClickResult] = React.useState({
      count: 0,
      refConnected: false,
    });

    return (
      <>
        <HoverCard {...args}>
          {({ getTriggerProps }) => (
            <button
              type="button"
              {...getTriggerProps({
                ref,
                onClick: (event) =>
                  setClickResult((current) => ({
                    count: current.count + 1,
                    refConnected: ref.current === event.currentTarget,
                  })),
              })}
            >
              Show preview
            </button>
          )}
        </HoverCard>
        <p>{clickResult.count} trigger clicks</p>
        <p>
          {clickResult.refConnected
            ? "Trigger ref connected"
            : "Trigger ref disconnected"}
        </p>
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Show preview" });

    await userEvent.click(trigger);
    await expect(canvas.getByText("1 trigger clicks")).toBeVisible();
    await expect(canvas.getByText("Trigger ref connected")).toBeVisible();
    await expect(await body.findByRole("dialog")).toBeVisible();
    await userEvent.click(trigger);
    await expect(canvas.getByText("2 trigger clicks")).toBeVisible();
    await expect(canvas.getByText("Trigger ref connected")).toBeVisible();
  },
});

export const TriggerRefCleanup = meta.story({
  name: "(Test) Trigger callback-ref cleanup",
  render: function TriggerRefCleanupExample(args) {
    const [showCard, setShowCard] = React.useState(true);
    const [cleanupCount, setCleanupCount] = React.useState(0);
    const ref = React.useCallback((node: HTMLElement | null) => {
      if (!node) return;
      return () => setCleanupCount((count) => count + 1);
    }, []);

    return (
      <>
        {showCard && (
          <HoverCard {...args}>
            {({ getTriggerProps }) => (
              <button type="button" {...getTriggerProps({ ref })}>
                Show preview
              </button>
            )}
          </HoverCard>
        )}
        <button type="button" onClick={() => setShowCard(false)}>
          Unmount preview
        </button>
        <p>{cleanupCount} ref cleanups</p>
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("0 ref cleanups")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Unmount preview" }),
    );
    await expect(canvas.getByText("1 ref cleanups")).toBeVisible();
  },
});

export const Disabled = meta.story({
  name: "(Test) Disabled hover and focus interactions",
  args: { enabled: false, onOpenChange: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Show preview" });

    await userEvent.hover(trigger);
    await userEvent.tab();
    await expect(trigger).toHaveFocus();
    await expect(args.onOpenChange).not.toHaveBeenCalled();
    await expect(body.queryByRole("dialog")).not.toBeInTheDocument();
  },
});

export const PopoverLayer = meta.story({
  name: "(Test) Controlled open card uses the popover layer",
  render: () => <ControlledExample initialOpen={true} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const card = await body.findByRole("dialog");

    await expect(card.closest('[data-layer="popover"]')).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  },
});

export const DisabledButton = meta.story({
  render: (args) => (
    <HoverCard {...args} placement="right">
      {({ getTriggerProps }) => (
        <span className="inline-flex" tabIndex={0} {...getTriggerProps()}>
          <button type="button" disabled>
            Unavailable action
          </button>
        </span>
      )}
    </HoverCard>
  ),
});

function ControlledExample({ initialOpen }: { initialOpen: boolean }) {
  const [open, setOpen] = React.useState(initialOpen);

  return (
    <ControlledHoverCard
      open={open}
      onOpenChange={setOpen}
      content={<div className="w-64 p-3">Controlled preview</div>}
    >
      {({ getTriggerProps }) => (
        <button
          type="button"
          {...getTriggerProps({ onClick: () => setOpen(!open) })}
        >
          Toggle preview
        </button>
      )}
    </ControlledHoverCard>
  );
}

export const Controlled = meta.story({
  render: () => <ControlledExample initialOpen={false} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Toggle preview" }),
    );
    const card = await body.findByRole("dialog");
    await expect(card).toHaveTextContent("Controlled preview");
    await expect(card.firstElementChild).toHaveClass(
      "bg-popover",
      "border",
      "shadow-md",
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  },
});
