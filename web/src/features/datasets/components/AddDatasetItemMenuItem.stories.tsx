import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { AddDatasetItemMenuItem } from "./AddDatasetItemMenuItem";

const meta = preview.meta({
  component: AddDatasetItemMenuItem,
});

export const Default = meta.story({
  args: {
    hasAccess: true,
    onClick: fn(),
  },
});

export const Disabled = meta.story({
  args: {
    hasAccess: false,
    onClick: fn(),
  },
});

export const OpensNewItemForm = meta.story({
  name: "(Test) Opens New Item Form",
  args: {
    hasAccess: true,
    onClick: fn(),
  },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole("button", {
        name: "Add to datasets",
      }),
    );

    await expect(args.onClick).toHaveBeenCalledOnce();
  },
});
