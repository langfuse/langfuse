import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";

import { MultiSelect } from "./multi-select";

const meta = preview.meta({
  component: MultiSelect,
});

export default meta;

const longDatasetName =
  "Customer support conversations from the enterprise production environment";

export const WithLongDatasetName = meta.story({
  name: "(Test) Long dataset name",
  args: {
    title: "Dataset",
    values: [],
    onValueChange: fn(),
    options: [
      {
        value: "dataset-1",
        displayValue: longDatasetName,
      },
    ],
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    await expect(
      within(canvasElement.ownerDocument.body).findByTitle(longDatasetName),
    ).resolves.toBeInTheDocument();
  },
});

export const MissingSelectedOption = meta.story({
  name: "(Test) Missing selected option",
  args: {
    values: ["GENERATION"],
    options: [],
    onValueChange: fn(),
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText("GENERATION"),
    ).toBeInTheDocument();
  },
});

export const EditedCustomValue = meta.story({
  name: "(Test) Edited custom value",
  args: {
    values: ["draft-value"],
    options: [],
    onValueChange: fn(),
    isCustomSelectEnabled: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button");

    await userEvent.click(trigger);

    const input = within(canvasElement.ownerDocument.body).getByPlaceholderText(
      "Enter custom value",
    );
    await userEvent.clear(input);
    await userEvent.type(input, "edited-value");

    await expect(within(trigger).getByText("edited-value")).toBeInTheDocument();
    await expect(
      within(trigger).queryByText("draft-value"),
    ).not.toBeInTheDocument();
  },
});

export const SeveralMissingSelectedOptions = meta.story({
  name: "(Test) Several missing selected options",
  args: {
    values: ["one", "two", "three", "four", "five", "six"],
    options: [],
    onValueChange: fn(),
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText("6 selected"),
    ).toBeInTheDocument();
  },
});
