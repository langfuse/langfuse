import { useState } from "react";
import { expect, fireEvent, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { MultiSelectInput } from "./MultiSelectInput";

const longOptionLabel =
  "This is a very long option label that should remain on a single line without wrapping";

const options = [
  { value: "evaluation", label: "Evaluation" },
  { value: "production", label: "Production" },
  { value: "regression", label: "Regression", secondaryLabel: "(current)" },
];

const largeOptions = Array.from({ length: 100 }, (_, index) => {
  const number = String(index + 1).padStart(3, "0");

  return {
    value: `dataset-${number}`,
    label: `Dataset ${number}`,
  };
});

const meta = preview.meta({
  component: MultiSelectInput,
});

export const Default = meta.story({
  args: {
    value: ["evaluation"],
    options,
    onValueChange: fn(),
    placeholder: "Select datasets",
    selectedLabel: "1 dataset selected",
    searchPlaceholder: "Search datasets...",
    emptyMessage: "No datasets found.",
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);

    return (
      <MultiSelectInput
        {...args}
        value={value}
        selectedLabel={`${value.length} dataset${value.length === 1 ? "" : "s"} selected`}
        onValueChange={(newValue) => {
          setValue(newValue);
          args.onValueChange(newValue);
        }}
      />
    );
  },
});

export const WithLongText = meta.story({
  args: {
    value: ["long-option"],
    options: [{ value: "long-option", label: longOptionLabel }],
    onValueChange: fn(),
    placeholder: "Select an option",
    selectedLabel: longOptionLabel,
    searchPlaceholder: "Search options...",
    emptyMessage: "No options found.",
  },
  render: (args) => (
    <div className="w-64">
      <MultiSelectInput {...args} />
    </div>
  ),
});

export const Empty = meta.story({
  args: {
    value: [],
    options: [],
    onValueChange: fn(),
    placeholder: "Select datasets",
    selectedLabel: "",
    searchPlaceholder: "Search datasets...",
    emptyMessage: "No datasets found.",
  },
});

export const LargeList = meta.story({
  args: {
    value: ["dataset-001", "dataset-050", "dataset-100"],
    options: largeOptions,
    onValueChange: fn(),
    placeholder: "Select datasets",
    selectedLabel: "3 datasets selected",
    searchPlaceholder: "Search datasets...",
    emptyMessage: "No datasets found.",
  },
});

export const TestSelectsMultipleOptions = meta.story({
  name: "(Test) Selects Multiple Options",
  args: {
    value: ["evaluation"],
    options,
    onValueChange: fn(),
    placeholder: "Select datasets",
    selectedLabel: "1 dataset selected",
    searchPlaceholder: "Search datasets...",
    emptyMessage: "No datasets found.",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("combobox"));
    await userEvent.click(body.getByText("Production"));

    await expect(args.onValueChange).toHaveBeenCalledWith([
      "evaluation",
      "production",
    ]);
  },
});

export const TestKeepsWheelInsidePopover = meta.story({
  name: "(Test) Keeps Wheel Inside Popover",
  args: {
    value: [],
    options: largeOptions,
    onValueChange: fn(),
    placeholder: "Select datasets",
    selectedLabel: "",
    searchPlaceholder: "Search datasets...",
    emptyMessage: "No datasets found.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bodyElement = canvasElement.ownerDocument.body;
    const body = within(bodyElement);
    const onWheel = fn();
    const onTouchMove = fn();
    bodyElement.addEventListener("wheel", onWheel);
    bodyElement.addEventListener("touchmove", onTouchMove);

    await userEvent.click(canvas.getByRole("combobox"));
    fireEvent.wheel(body.getByRole("listbox"));
    fireEvent.touchMove(body.getByRole("listbox"));

    await expect(onWheel).not.toHaveBeenCalled();
    await expect(onTouchMove).not.toHaveBeenCalled();
    bodyElement.removeEventListener("wheel", onWheel);
    bodyElement.removeEventListener("touchmove", onTouchMove);
  },
});

export const TestKeepsOverlappingLabelsDistinct = meta.story({
  name: "(Test) Keeps Overlapping Labels Distinct",
  args: {
    value: [],
    options: [
      { value: "dataset-uppercase", label: "Test" },
      { value: "dataset-lowercase", label: "test" },
    ],
    onValueChange: fn(),
    placeholder: "Select datasets",
    selectedLabel: "",
    searchPlaceholder: "Search datasets...",
    emptyMessage: "No datasets found.",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("combobox"));
    await userEvent.type(
      body.getByPlaceholderText("Search datasets..."),
      "test",
    );
    const renderedOptions = body.getAllByRole("option");
    const uppercaseOption = body.getByRole("option", {
      name: /^Test$/,
    });
    const lowercaseOption = body.getByRole("option", {
      name: /^test$/,
    });

    await expect(renderedOptions).toHaveLength(2);
    await expect(uppercaseOption).toHaveAttribute(
      "data-value",
      "dataset-uppercase",
    );
    await expect(lowercaseOption).toHaveAttribute(
      "data-value",
      "dataset-lowercase",
    );
    await userEvent.click(lowercaseOption);

    await expect(args.onValueChange).toHaveBeenCalledWith([
      "dataset-lowercase",
    ]);
  },
});
