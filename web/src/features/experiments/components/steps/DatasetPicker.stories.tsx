import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../../.storybook/preview";

import { DatasetPicker } from "./DatasetPicker";

const meta = preview.meta({
  component: DatasetPicker,
});

export default meta;

const longDatasetName =
  "dataset_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyz";

export const WithLongDatasetName = meta.story({
  name: "(Test) Long dataset name",
  args: {
    datasets: [{ id: "dataset-1", name: longDatasetName }],
    selectedDatasetId: null,
    onSelect: fn(),
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("combobox"));

    const optionLabel = await within(
      canvasElement.ownerDocument.body,
    ).findByTitle(longDatasetName);
    const styles = getComputedStyle(optionLabel);

    await expect(styles.overflow).toBe("hidden");
    await expect(styles.textOverflow).toBe("ellipsis");
    await expect(styles.whiteSpace).toBe("nowrap");
  },
});
