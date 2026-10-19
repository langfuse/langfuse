import { useState } from "react";
import { expect, fn, userEvent } from "storybook/test";
import preview from "../../../.storybook/preview";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { FacetHeader } from "./FacetHeader";

const meta = preview.meta({ component: FacetHeader });

export const Default = meta.story({
  args: {
    label: "Environment",
    children: <span className="min-w-0 truncate">Environment</span>,
    summary: "All",
    summaryIcon: null,
    isActive: false,
    isDisabled: false,
    onReset: fn(),
    "aria-expanded": false,
  },
});

export const WithSelection = meta.story({
  args: {
    label: "Environment",
    children: <span className="min-w-0 truncate">Environment</span>,
    summary: "production",
    summaryIcon: null,
    isActive: true,
    isDisabled: false,
    onReset: fn(),
    "aria-expanded": false,
  },
});

export const TestHeaderHeight = meta.story({
  name: "(Test) Selection Keeps Header Height",
  args: {
    label: "Environment",
    children: <span className="min-w-0 truncate">Environment</span>,
    summary: "All",
    summaryIcon: null,
    isActive: false,
    isDisabled: false,
    onReset: fn(),
    "aria-expanded": true,
  },
  render: (args) => {
    const [selected, setSelected] = useState(false);
    return (
      <div className="w-72">
        <div className="flex">
          <FacetHeader
            {...args}
            isActive={selected}
            summary={selected ? "production" : "All"}
            onReset={() => setSelected(false)}
          />
        </div>
        <label className="flex items-center gap-2 p-2">
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => setSelected(checked === true)}
          />
          production
        </label>
      </div>
    );
  },
  play: async ({ canvas }) => {
    const header = canvas.getByRole("button", { name: /^Environment$/ });
    const initialHeight = header.getBoundingClientRect().height;
    await userEvent.click(canvas.getByRole("checkbox", { name: "production" }));
    await expect(
      canvas.getByRole("button", { name: "Clear Environment filter" }),
    ).toBeVisible();
    await expect(header.getBoundingClientRect().height).toBe(initialHeight);
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Environment filter" }),
    );
    await expect(header.getBoundingClientRect().height).toBe(initialHeight);
    await expect(
      canvas.getByRole("checkbox", { name: "production" }),
    ).not.toBeChecked();
  },
});
