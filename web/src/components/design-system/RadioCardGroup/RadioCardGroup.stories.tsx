import { useState } from "react";
import { expect, fn, waitFor } from "storybook/test";
import preview from "@/.storybook/preview";
import { RadioCardGroup } from "./RadioCardGroup";

const meta = preview.meta({
  component: RadioCardGroup,
  args: {
    "aria-label": "Trace visibility",
    options: [
      { value: "show", label: "Show" },
      { value: "hide", label: "Hide" },
    ],
    value: "show",
    onValueChange: fn(),
  },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return (
      <RadioCardGroup
        {...args}
        value={value}
        onValueChange={(nextValue) => {
          setValue(nextValue);
          args.onValueChange(nextValue);
        }}
      />
    );
  },
});

export const Default = meta.story({});

export const KeyboardSelection = meta.story({
  name: "(Test) Keyboard selection",
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(canvas.getByRole("radio", { name: "Show" }));
    await userEvent.keyboard("{ArrowRight>}");
    await waitFor(() =>
      expect(canvas.getByRole("radio", { name: "Hide" })).toBeChecked(),
    );
    await userEvent.keyboard("{/ArrowRight}");
    await expect(args.onValueChange).toHaveBeenCalledWith("hide");
    await userEvent.keyboard("{ArrowLeft>}");
    await waitFor(() =>
      expect(canvas.getByRole("radio", { name: "Show" })).toBeChecked(),
    );
    await userEvent.keyboard("{/ArrowLeft}");
  },
});

export const Vertical = meta.story({
  args: { orientation: "vertical" },
});

export const VerticalFirstPick = meta.story({
  name: "(Test) Vertical, nothing picked yet",
  args: { orientation: "vertical", value: null },
  play: async ({ canvas, args, userEvent }) => {
    await expect(canvas.getByRole("radio", { name: "Show" })).not.toBeChecked();
    await expect(canvas.getByRole("radio", { name: "Hide" })).not.toBeChecked();
    await userEvent.click(canvas.getByRole("radio", { name: "Hide" }));
    await expect(args.onValueChange).toHaveBeenCalledWith("hide");
    await userEvent.keyboard("{ArrowUp>}");
    await waitFor(() =>
      expect(canvas.getByRole("radio", { name: "Show" })).toBeChecked(),
    );
    await userEvent.keyboard("{/ArrowUp}");
  },
});
