import * as React from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { PopoverController } from "./PopoverController";

const meta = preview.meta({
  component: PopoverController,
  args: {
    children: () => null,
    open: false,
    onOpenChange: fn(),
    content: (
      <div className="bg-popover w-48 rounded-md border p-3 shadow-md">
        Picker content
      </div>
    ),
  },
  render: function PopoverExample(args) {
    const [open, setOpen] = React.useState(args.open);
    return (
      <PopoverController {...args} open={open} onOpenChange={setOpen}>
        {({ getTriggerProps }) => (
          <button type="button" {...getTriggerProps()}>
            Open popover
          </button>
        )}
      </PopoverController>
    );
  },
});

export const Default = meta.story({});

export const OpensOnClick = meta.story({
  name: "(Test) Opens on click",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "Open popover" }));
    await expect(await body.findByRole("dialog")).toHaveTextContent(
      "Picker content",
    );
  },
});
