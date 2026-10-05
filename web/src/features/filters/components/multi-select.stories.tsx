import { fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";

import { MultiSelect } from "./multi-select";

const meta = preview.meta({
  component: MultiSelect,
});

export default meta;

export const WithLongDatasetName = meta.story({
  args: {
    title: "Dataset",
    values: [],
    onValueChange: fn(),
    options: [
      {
        value: "dataset-1",
        displayValue:
          "Customer support conversations from the enterprise production environment",
      },
    ],
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
  },
});
