import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { NewDatasetItemFromExistingObjectInDatasets } from "./NewDatasetItemFromExistingObjectInDatasets";

const meta = preview.meta({
  component: NewDatasetItemFromExistingObjectInDatasets,
});

const items = [
  {
    id: "item-1",
    datasetId: "dataset-1",
    datasetName: "Support conversations",
  },
];

export const Toolbar = meta.story({
  args: {
    projectId: "project-1",
    items,
    hasAccess: true,
    size: "default",
    layout: "toolbar",
    onOpen: fn(),
  },
});

export const Menu = meta.story({
  args: {
    projectId: "project-1",
    items,
    hasAccess: true,
    size: "default",
    layout: "menu",
    onOpen: fn(),
  },
});

export const OpensDialog = meta.story({
  name: "(Test) Opens Dialog",
  args: {
    projectId: "project-1",
    items,
    hasAccess: true,
    size: "default",
    layout: "toolbar",
    onOpen: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: /In 1 dataset/ }),
    );
    await userEvent.click(
      await within(document.body).findByRole("menuitem", {
        name: "Add to more datasets",
      }),
    );

    await expect(args.onOpen).toHaveBeenCalledOnce();
  },
});
