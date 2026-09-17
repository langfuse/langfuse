import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { MultiSelectTagInput } from "./MultiSelectTagInput";

const options = [
  { value: "option-1", label: "Option 1" },
  { value: "option-2", label: "Option 2" },
  { value: "option-3", label: "Option 3" },
  { value: "option-4", label: "Option 4" },
];

const manyOptions = Array.from({ length: 20 }, (_, index) => ({
  value: `option-${index + 1}`,
  label: `Option ${index + 1}`,
}));

const meta = preview.meta({
  component: MultiSelectTagInput,
});

export const Default = meta.story({
  args: {
    value: options.slice(0, 3).map((option) => option.value),
    options,
    onValueChange: fn(),
    placeholder: "Select options",
    searchPlaceholder: "Search options...",
    emptyMessage: "No options found.",
    selectAllLabel: "Select All",
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);

    return (
      <MultiSelectTagInput
        {...args}
        value={value}
        onValueChange={(newValue) => {
          setValue(newValue);
          args.onValueChange(newValue);
        }}
      />
    );
  },
});

export const ConstrainedWidth = meta.story({
  args: {
    value: options.slice(0, 3).map((option) => option.value),
    options,
    onValueChange: fn(),
    placeholder: "Select options",
    searchPlaceholder: "Search options...",
    emptyMessage: "No options found.",
    selectAllLabel: "Select All",
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);

    return (
      <div className="w-96">
        <MultiSelectTagInput
          {...args}
          value={value}
          onValueChange={(newValue) => {
            setValue(newValue);
            args.onValueChange(newValue);
          }}
        />
      </div>
    );
  },
});

export const Empty = meta.story({
  args: {
    value: [],
    options: [],
    onValueChange: fn(),
    placeholder: "Select options",
    searchPlaceholder: "Search options...",
    emptyMessage: "No options found.",
  },
});

export const ManySelected = meta.story({
  args: {
    value: manyOptions.map((option) => option.value),
    options: manyOptions,
    onValueChange: fn(),
    placeholder: "Select options",
    searchPlaceholder: "Search options...",
    emptyMessage: "No options found.",
    selectAllLabel: "Select All",
  },
  render: (args) => (
    <div className="w-96">
      <MultiSelectTagInput {...args} />
    </div>
  ),
});

export const TestRemovesTag = meta.story({
  name: "(Test) Removes Tag",
  args: {
    value: ["option-1", "option-2"],
    options,
    onValueChange: fn(),
    placeholder: "Select options",
    searchPlaceholder: "Search options...",
    emptyMessage: "No options found.",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("button", { name: "Remove Option 1" }),
    );
    await expect(args.onValueChange).toHaveBeenCalledWith(["option-2"]);
  },
});

export const TestSelectsOption = meta.story({
  name: "(Test) Selects Option",
  args: {
    value: ["option-1"],
    options,
    onValueChange: fn(),
    placeholder: "Select options",
    searchPlaceholder: "Search options...",
    emptyMessage: "No options found.",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    canvas.getByRole("combobox").focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.click(body.getByRole("option", { name: "Option 2" }));
    await expect(args.onValueChange).toHaveBeenCalledWith([
      "option-1",
      "option-2",
    ]);
  },
});

export const TestOverflowBadgePlacement = meta.story({
  name: "(Test) Keeps Overflow Badge Adjacent",
  args: {
    value: manyOptions.map((option) => option.value),
    options: manyOptions,
    onValueChange: fn(),
    placeholder: "Select options",
    searchPlaceholder: "Search options...",
    emptyMessage: "No options found.",
  },
  render: (args) => (
    <div className="w-96">
      <MultiSelectTagInput {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      const overflowBadge = canvasElement.querySelector<HTMLElement>(
        "[data-overflow-count]",
      );
      const visibleTags = [
        ...canvasElement.querySelectorAll<HTMLElement>("[data-value]"),
      ].filter((tag) => getComputedStyle(tag).visibility !== "hidden");
      const lastVisibleTag = visibleTags.at(-1);
      const layout = canvasElement.querySelector<HTMLElement>(
        "[data-tag-input-layout]",
      );
      const clearButton = canvasElement.querySelector<HTMLElement>(
        "[data-clear-selection]",
      );

      expect(overflowBadge).not.toBeNull();
      expect(lastVisibleTag).toBeDefined();
      expect(layout).not.toBeNull();
      expect(clearButton).not.toBeNull();

      if (!overflowBadge || !lastVisibleTag || !layout || !clearButton) return;

      const gap =
        overflowBadge.getBoundingClientRect().left -
        lastVisibleTag.getBoundingClientRect().right;
      const clearRightGap =
        layout.getBoundingClientRect().right -
        clearButton.getBoundingClientRect().right;
      const layoutStyles = getComputedStyle(layout);
      const expectedTagGap = Number.parseFloat(layoutStyles.columnGap);
      const expectedClearRightGap = Number.parseFloat(
        layoutStyles.paddingRight,
      );

      expect(Math.abs(gap - expectedTagGap)).toBeLessThanOrEqual(0.5);
      expect(
        Math.abs(clearRightGap - expectedClearRightGap),
      ).toBeLessThanOrEqual(0.5);
    });
  },
});
