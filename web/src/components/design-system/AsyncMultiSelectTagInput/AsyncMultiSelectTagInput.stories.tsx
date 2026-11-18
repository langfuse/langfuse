import { fn } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { AsyncMultiSelectTagInput } from "./AsyncMultiSelectTagInput";

const meta = preview.meta({ component: AsyncMultiSelectTagInput });

const options = [
  { value: "ada", label: "Ada Andersen" },
  {
    value: "ben",
    label: "Ben Hoffmann",
    secondaryLabel: "Has a budget",
    disabled: true,
  },
  { value: "chloe", label: "Chloe Okafor" },
];

export const Default = meta.story({
  args: {
    value: [options[0]!],
    options,
    onValueChange: fn(),
    placeholder: "Select users",
    search: { placeholder: "Search…", value: "", onValueChange: fn() },
    emptyMessage: "No matches.",
    "aria-label": "Users",
  },
});

export const Loading = meta.story({
  args: {
    ...Default.input.args,
    options: [],
    search: { placeholder: "Search…", value: "ros", onValueChange: fn() },
    loading: { message: "Loading…" },
  },
});
