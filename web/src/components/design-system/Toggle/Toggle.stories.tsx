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

export const Chip = meta.story({
  args: {
    variant: "chip",
    children: "Frameworks",
    count: 24,
    pressed: true,
  },
});

export const VariantMatrix = meta.story({
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-wrap items-center gap-1.5">
      <Toggle pressed={false}>Comparison</Toggle>
      <Toggle pressed>Baseline</Toggle>
      <Toggle variant="chip" count={126} pressed>
        All
      </Toggle>
      <Toggle variant="chip" count={24} pressed={false}>
        Frameworks
      </Toggle>
      <Toggle variant="chip" count={null} pressed={false}>
        OpenAI
      </Toggle>
    </div>
  ),
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

export const TestChipReadsItsCount = meta.story({
  name: "(Test) Chip Reads Its Count",
  args: {
    variant: "chip",
    children: "Frameworks",
    count: 24,
    pressed: true,
  },
  play: async ({ canvasElement }) => {
    const chip = within(canvasElement).getByRole("button", {
      name: "Frameworks 24",
    });
    await expect(chip).toHaveAttribute("aria-pressed", "true");
  },
});
