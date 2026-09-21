import { expect, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Input } from "./Input";

const meta = preview.meta({
  component: Input,
});

export const Default = meta.story({
  args: {
    "aria-label": "Dataset name",
    placeholder: "Enter a dataset name",
  },
});

export const WithValue = meta.story({
  args: {
    "aria-label": "Dataset name",
    defaultValue: "production/evaluations",
  },
});

export const Invalid = meta.story({
  args: {
    "aria-label": "Dataset name",
    "aria-invalid": true,
    defaultValue: "Existing dataset",
    error: true,
  },
});

export const Disabled = meta.story({
  args: {
    "aria-label": "Dataset name",
    disabled: true,
    defaultValue: "production/evaluations",
  },
});

export const TestAcceptsText = meta.story({
  name: "(Test) Accepts Text",
  args: {
    "aria-label": "Dataset name",
  },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByLabelText("Dataset name");

    await userEvent.type(input, "production/evaluations");
    await expect(input).toHaveValue("production/evaluations");
  },
});
