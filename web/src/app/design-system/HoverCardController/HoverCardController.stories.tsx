import * as React from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { HoverCardController } from "./HoverCardController";

const meta = preview.meta({
  component: HoverCardController,
  args: {
    children: () => null,
    open: false,
    onOpenChange: fn(),
    openDelay: 0,
    closeDelay: 100,
    content: (
      <div className="bg-muted w-64 rounded-md p-3 shadow-md">
        A custom surface, composed without the default card frame.
      </div>
    ),
  },
  render: function CustomSurfaceExample(args) {
    const [open, setOpen] = React.useState(args.open);
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
});

export const Default = meta.story({});

export const CustomSurface = meta.story({
  name: "(Test) Custom surface",
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
