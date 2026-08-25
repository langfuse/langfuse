import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { CopyDatasetItemButton } from "./CopyDatasetItemButton";

const meta = preview.meta({
  component: CopyDatasetItemButton,
});

export const Default = meta.story({
  args: {
    hasAccess: true,
    size: "default",
    onClick: fn(),
  },
});

export const Disabled = meta.story({
  args: {
    hasAccess: false,
    size: "default",
    onClick: fn(),
  },
});

export const OpensCopyForm = meta.story({
  name: "(Test) Opens Copy Form",
  args: {
    hasAccess: true,
    size: "default",
    onClick: fn(),
  },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: "Copy item" }),
    );

    await expect(args.onClick).toHaveBeenCalledOnce();
  },
});
