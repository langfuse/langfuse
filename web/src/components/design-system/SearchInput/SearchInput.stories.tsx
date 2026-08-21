import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/src/components/ui/dropdown-menu";
import { SearchInput } from "./SearchInput";

function InteractiveSearchInput(props: ComponentProps<typeof SearchInput>) {
  const [value, setValue] = useState(props.value);

  return (
    <SearchInput
      {...props}
      value={value}
      onChange={(newValue) => {
        setValue(newValue);
        props.onChange(newValue);
      }}
    />
  );
}

const dropdown = {
  label: "Names, Tags",
  content: (
    <DropdownMenuRadioGroup value="metadata">
      <DropdownMenuRadioItem value="metadata">
        Names, Tags
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="content">Full Text</DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  ),
};

const meta = preview.meta({
  component: SearchInput,
  render: (args) => <InteractiveSearchInput {...args} />,
  args: {
    disabled: false,
    onSubmit: fn(),
    onChange: fn(),
    placeholder: "Search...",
    value: "",
  },
});

export const Default = meta.story({});

export const WithDropdown = meta.story({
  args: {
    dropdown,
  },
});

export const Disabled = meta.story({
  args: {
    disabled: true,
    dropdown,
  },
});

export const TestSubmitsOnEnter = meta.story({
  name: "(Test) Submits on Enter",
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("searchbox");
    await userEvent.type(input, "Prompt name{enter}");
    await expect(input).toHaveValue("Prompt name");
    await expect(args.onSubmit).toHaveBeenCalledWith("Prompt name");
  },
});

export const TestOpensDropdown = meta.story({
  name: "(Test) Opens Dropdown",
  args: {
    dropdown,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Names, Tags" });
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("data-state", "open");
  },
});
