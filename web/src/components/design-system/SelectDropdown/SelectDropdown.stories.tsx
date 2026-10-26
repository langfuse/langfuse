import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { DropdownIndicator } from "../DropdownIndicator/DropdownIndicator";
import { SelectDropdown } from "./SelectDropdown";

const meta = preview.meta({ component: SelectDropdown });

export const CompactTrigger = meta.story({
  name: "(Test) Compact trigger",
  args: {
    "aria-label": "Output language",
    value: "auto",
    options: [
      { value: "auto", label: "Auto (JSON)" },
      { value: "text", label: "Plain text" },
      { value: "json", label: "JSON" },
      { value: "python", label: "Python" },
    ],
    onValueChange: fn(),
    ref: fn(),
    children: ({ getTriggerProps, selectedLabel }) => (
      <button
        {...getTriggerProps()}
        className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs focus-visible:ring-2 focus-visible:outline-hidden"
      >
        {selectedLabel}
        <DropdownIndicator />
      </button>
    ),
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <SelectDropdown
        {...args}
        value={value}
        onValueChange={(newValue) => {
          setValue(newValue);
          args.onValueChange(newValue);
        }}
      />
    );
  },
  play: async ({ canvas, args }) => {
    const trigger = canvas.getByRole("combobox", { name: "Output language" });
    await expect(args.ref).toHaveBeenCalledWith(trigger);
    await userEvent.click(trigger);
    await userEvent.click(
      within(document.body).getByRole("option", { name: "Python" }),
    );
    await expect(trigger).toHaveTextContent("Python");
    await expect(args.onValueChange).toHaveBeenCalledWith("python");
  },
});

export const WrappedTrigger = CompactTrigger.extend({
  name: "(Test) Wrapped trigger with keyboard selection",
  args: {
    children: ({ getTriggerProps, selectedLabel }) => (
      <div>
        <button {...getTriggerProps()}>{selectedLabel}</button>
      </div>
    ),
  },
  play: async ({ canvas, args }) => {
    const trigger = canvas.getByRole("combobox", { name: "Output language" });
    await expect(args.ref).toHaveBeenCalledWith(trigger);
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{End}{Enter}");
    await expect(trigger).toHaveTextContent("Python");
    await expect(args.onValueChange).toHaveBeenCalledWith("python");
  },
});

export const PreventOpening = CompactTrigger.extend({
  name: "(Test) Trigger handler can prevent opening",
  args: {
    children: ({ getTriggerProps, selectedLabel }) => (
      <button
        {...getTriggerProps({
          onKeyDown: (event) => event.preventDefault(),
        })}
      >
        {selectedLabel}
      </button>
    ),
  },
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("combobox", { name: "Output language" });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(within(document.body).queryByRole("listbox")).toBeNull();
  },
});

export const GroupedDisabledOptions = CompactTrigger.extend({
  name: "(Test) Grouped and disabled options",
  args: {
    value: "json",
    options: [
      {
        type: "group",
        id: "languages",
        label: "Languages",
        options: [
          { value: "json", label: "JSON" },
          {
            value: "python",
            label: "Python",
            disabled: true,
            disabledReason: "Unavailable",
          },
        ],
      },
    ],
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Output language" }),
    );
    const body = within(document.body);
    await waitFor(() =>
      expect(body.getByRole("group", { name: "Languages" })).toBeVisible(),
    );
    await expect(body.getByRole("option", { name: "Python" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  },
});
