import { expect, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Tooltip } from "./Tooltip";

const meta = preview.meta({
  component: Tooltip,
  args: {
    children: () => null,
    delay: 0,
    label: "Additional context",
  },
  render: (args) => (
    <Tooltip {...args}>
      {({ getTriggerProps }) => (
        <button type="button" {...getTriggerProps()}>
          Hover or focus me
        </button>
      )}
    </Tooltip>
  ),
});

export const Default = meta.story({});

export const DisabledTrigger = meta.story({
  args: {
    label: "This action is unavailable",
  },
  render: (args) => (
    <Tooltip {...args}>
      {({ getTriggerProps }) => (
        <span {...getTriggerProps()}>
          <button type="button" disabled>
            Unavailable action
          </button>
        </span>
      )}
    </Tooltip>
  ),
});

export const TestHoverAndFocus = meta.story({
  name: "(Test) Hover and focus",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Hover or focus me" });

    await userEvent.hover(trigger);
    await waitFor(() =>
      expect(body.getByRole("tooltip")).toHaveTextContent("Additional context"),
    );

    await userEvent.unhover(trigger);
    await waitFor(() =>
      expect(body.queryByRole("tooltip")).not.toBeInTheDocument(),
    );

    trigger.focus();
    await waitFor(() => expect(body.getByRole("tooltip")).toBeVisible());
    await expect(trigger).toHaveAttribute(
      "aria-describedby",
      body.getByRole("tooltip").id,
    );
  },
});
