import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Toggle } from "./Toggle";

const meta = preview.meta({
  component: Toggle,
});

export const Default = meta.story({
  args: {
    "aria-label": "Toggle",
    children: "Toggle",
    onPressedChange: fn(),
    size: "default",
    variant: "default",
  },
});

export const Outline = meta.story({
  args: {
    "aria-label": "Outline toggle",
    children: "Outline",
    onPressedChange: fn(),
    size: "default",
    variant: "outline",
  },
});

export const Ghost = meta.story({
  args: {
    "aria-label": "Ghost toggle",
    children: "Ghost",
    onPressedChange: fn(),
    pressed: true,
    size: "compact",
    variant: "ghost",
  },
});

export const Disabled = meta.story({
  args: {
    "aria-label": "Disabled toggle",
    children: "Disabled",
    disabled: true,
    size: "default",
    variant: "default",
  },
});

export const TestTogglesPressedState = meta.story({
  name: "(Test) Toggles Pressed State",
  args: {
    "aria-label": "Test toggle",
    children: "Toggle",
    onPressedChange: fn(),
    size: "default",
    variant: "default",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: "Test toggle" });

    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(args.onPressedChange).toHaveBeenCalledWith(true);
  },
});

export const TestDisabledToggleDoesNotChange = meta.story({
  name: "(Test) Disabled Toggle Does Not Change",
  args: {
    "aria-label": "Disabled test toggle",
    children: "Toggle",
    disabled: true,
    onPressedChange: fn(),
    size: "default",
    variant: "default",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", {
      name: "Disabled test toggle",
    });

    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(args.onPressedChange).not.toHaveBeenCalled();
  },
});
