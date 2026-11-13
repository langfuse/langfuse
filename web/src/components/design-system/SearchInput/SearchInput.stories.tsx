import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/src/components/ui/dropdown-menu";
import { SearchInput } from "./SearchInput";

/** Args shared by both modes, for stories that set `mode` themselves. */
type SharedStoryArgs = Pick<
  ComponentProps<typeof SearchInput>,
  "value" | "onChange" | "placeholder" | "disabled"
>;

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

/** The clear button appears only while the field has a value. */
export const WithValue = meta.story({
  args: {
    value: "Prompt name",
  },
});

/** `default` for embedded toolbars, `large` for full-page lists. */
export const Sizes = meta.story({
  render: (args: SharedStoryArgs) => (
    <div className="flex flex-col gap-3">
      <InteractiveSearchInput {...args} onSubmit={() => {}} size="default" />
      <InteractiveSearchInput {...args} onSubmit={() => {}} size="large" />
    </div>
  ),
});

/** `filter` mode narrows a list as you type: the icon is decorative and Enter does nothing. */
export const FilterMode = meta.story({
  render: (args: SharedStoryArgs) => (
    <InteractiveSearchInput
      mode="filter"
      value={args.value}
      onChange={args.onChange}
      placeholder="Search projects..."
    />
  ),
});

/** `borderless` for surfaces that frame the field themselves, e.g. a menu header. */
export const Borderless = meta.story({
  render: (args: SharedStoryArgs) => (
    <div className="bg-popover w-72 rounded-md border">
      <div className="border-b">
        <InteractiveSearchInput
          mode="filter"
          variant="borderless"
          size="large"
          value={args.value}
          onChange={args.onChange}
          placeholder="Search projects..."
        />
      </div>
      <div className="px-3 py-2 text-sm">Project A</div>
    </div>
  ),
});

export const WithDropdown = meta.story({
  args: {
    dropdown,
  },
});

export const Disabled = meta.story({
  args: {
    disabled: true,
    value: "Prompt name",
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

export const TestFilterModeDoesNotSubmit = meta.story({
  name: "(Test) Filter Mode Does Not Submit",
  render: (args: SharedStoryArgs) => (
    <InteractiveSearchInput
      mode="filter"
      value={args.value}
      onChange={args.onChange}
      placeholder={args.placeholder}
    />
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("searchbox"), "Prompt{enter}");
    await expect(args.onChange).toHaveBeenLastCalledWith("Prompt");
    await expect(
      canvas.queryByRole("button", { name: "Search" }),
    ).not.toBeInTheDocument();
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

export const TestClearsTheValue = meta.story({
  name: "(Test) Clears the Value",
  args: {
    value: "Prompt name",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("searchbox");
    await userEvent.click(canvas.getByRole("button", { name: "Clear search" }));
    await expect(input).toHaveValue("");
    await expect(args.onChange).toHaveBeenCalledWith("");
    await expect(
      canvas.queryByRole("button", { name: "Clear search" }),
    ).not.toBeInTheDocument();
    // Clearing is a draft change, like typing — applying it stays with Enter
    // and the search button.
    await expect(args.onSubmit).not.toHaveBeenCalled();
    // The field keeps focus so the next query can be typed straight away,
    // even though the button that was clicked has gone.
    await expect(input).toHaveFocus();
  },
});
