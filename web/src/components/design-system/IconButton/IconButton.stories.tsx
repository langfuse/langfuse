import { Copy, Trash2 } from "lucide-react";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { IconButton } from "./IconButton";

const onClick = fn();

const meta = preview.meta({
  component: IconButton,
  args: {
    icon: Copy,
    label: "Copy",
    onClick,
  },
});

export const Default = meta.story({});

export const OutlinedDestructive = meta.story({
  args: {
    icon: Trash2,
    label: "Delete",
    variant: "outlineDestructive",
  },
});

export const TestClick = meta.story({
  name: "(Test) Click",
  play: async ({ canvasElement }) => {
    onClick.mockClear();
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Copy" }),
    );
    await expect(onClick).toHaveBeenCalledOnce();
  },
});
