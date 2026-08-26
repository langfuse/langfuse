import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Toggle } from "./Toggle";

const meta = preview.meta({
  component: Toggle,
});

export const Default = meta.story({
  args: {
    children: "Comparison",
    pressed: false,
  },
});

export const Pressed = meta.story({
  args: {
    children: "Baseline",
    pressed: true,
  },
});

export const TestHandlesClick = meta.story({
  name: "(Test) Handles Click",
  args: {
    children: "Toggle",
    onClick: fn(),
    pressed: false,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: "Toggle" });

    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
});
