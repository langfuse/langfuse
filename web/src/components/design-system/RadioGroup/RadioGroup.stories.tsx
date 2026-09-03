import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { RadioGroup } from "./RadioGroup";

const meta = preview.meta({
  component: RadioGroup,
  args: {
    onValueChange: fn(),
  },
});

const options = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
] as const;

function LabeledItems({
  disabled = false,
  idPrefix,
}: {
  disabled?: boolean;
  idPrefix: string;
}) {
  return (
    <>
      {options.map((option) => {
        const id = `${idPrefix}-${option.value}`;

        return (
          <label
            key={option.value}
            className="flex items-center gap-2"
            htmlFor={id}
          >
            <RadioGroup.Item disabled={disabled} id={id} value={option.value} />
            {option.label}
          </label>
        );
      })}
    </>
  );
}

export const Default = meta.story({
  args: {
    children: <LabeledItems idPrefix="default" />,
    defaultValue: "apple",
  },
});

export const Disabled = meta.story({
  args: {
    children: <LabeledItems disabled idPrefix="disabled" />,
    defaultValue: "apple",
  },
});

export const TestSelectsOption = meta.story({
  name: "(Test) Selects Option",
  args: {
    children: <LabeledItems idPrefix="selects-option" />,
    defaultValue: "apple",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const banana = canvas.getByRole("radio", { name: "Banana" });

    await expect(canvas.getByRole("radio", { name: "Apple" })).toBeChecked();
    await expect(banana).not.toBeChecked();
    await userEvent.click(banana);
    await expect(banana).toBeChecked();
    await expect(args.onValueChange).toHaveBeenCalledWith("banana");
  },
});

export const TestDoesNotSelectDisabled = meta.story({
  name: "(Test) Does Not Select Disabled",
  args: {
    children: <LabeledItems disabled idPrefix="disabled-option" />,
    defaultValue: "apple",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const banana = canvas.getByRole("radio", { name: "Banana" });

    await userEvent.click(banana);
    await expect(banana).not.toBeChecked();
    await expect(canvas.getByRole("radio", { name: "Apple" })).toBeChecked();
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
});
