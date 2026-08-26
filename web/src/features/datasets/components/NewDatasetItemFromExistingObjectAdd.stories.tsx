import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { NewDatasetItemFromExistingObjectAdd } from "./NewDatasetItemFromExistingObjectAdd";

const meta = preview.meta({
  component: NewDatasetItemFromExistingObjectAdd,
});

export const Toolbar = meta.story({
  args: {
    hasAccess: true,
    variant: "secondary",
    size: "default",
    layout: "toolbar",
    onOpen: fn(),
  },
});

export const Menu = meta.story({
  args: {
    hasAccess: true,
    variant: "secondary",
    size: "default",
    layout: "menu",
    onOpen: fn(),
  },
});

export const OpensDialog = meta.story({
  name: "(Test) Opens Dialog",
  args: {
    hasAccess: true,
    variant: "secondary",
    size: "default",
    layout: "toolbar",
    onOpen: fn(),
  },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole("button", {
        name: "Add to datasets",
      }),
    );

    await expect(args.onOpen).toHaveBeenCalledOnce();
  },
});
