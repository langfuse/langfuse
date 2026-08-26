import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { NewDatasetItemFromExistingObjectCopy } from "./NewDatasetItemFromExistingObjectCopy";

const meta = preview.meta({
  component: NewDatasetItemFromExistingObjectCopy,
});

export const Default = meta.story({
  args: {
    hasAccess: true,
    size: "default",
    onOpen: fn(),
  },
});

export const OpensDialog = meta.story({
  name: "(Test) Opens Dialog",
  args: {
    hasAccess: true,
    size: "default",
    onOpen: fn(),
  },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: "Copy item" }),
    );

    await expect(args.onOpen).toHaveBeenCalledOnce();
  },
});
