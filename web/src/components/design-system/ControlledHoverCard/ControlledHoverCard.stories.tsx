import * as React from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { ControlledHoverCard } from "./ControlledHoverCard";

const meta = preview.meta({
  component: ControlledHoverCard,
  args: {
    children: () => null,
    content: <div className="w-64 p-3">Controlled preview</div>,
    open: false,
    onOpenChange: fn(),
    openDelay: 0,
    closeDelay: 100,
  },
  render: function ControlledExample(args) {
    const [open, setOpen] = React.useState(args.open);

    return (
      <ControlledHoverCard {...args} open={open} onOpenChange={setOpen}>
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
  },
});

export const Default = meta.story({});

export const ControlledClosed = meta.story({
  name: "(Test) Controlled state stays closed",
  render: (args) => (
    <ControlledHoverCard {...args}>
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

export const PopoverLayer = meta.story({
  name: "(Test) Controlled open card uses the popover layer",
  args: { open: true },
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

export const Controlled = meta.story({
  name: "(Test) Controlled",
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
