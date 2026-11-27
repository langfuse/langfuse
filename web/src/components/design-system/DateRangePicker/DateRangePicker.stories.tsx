import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Button } from "../Button/Button";
import { DateRangePicker } from "./DateRangePicker";

const meta = preview.meta({ component: DateRangePicker });

const presets = [
  { value: "last7Days", label: "Last 7 days" },
  { value: "last30Days", label: "Last 30 days" },
];

export const ButtonTrigger = meta.story({
  name: "(Test) Button trigger selects a preset",
  args: {
    value: "last7Days",
    presets,
    onPresetChange: () => undefined,
    onCustomChange: () => undefined,
    children: null,
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    const label = presets.find((preset) => preset.value === value)?.label;
    return (
      <DateRangePicker {...args} value={value} onPresetChange={setValue}>
        <Button type="button" variant="outline" text={label ?? "Date range"} />
      </DateRangePicker>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Last 7 days" }));
    await userEvent.click(body.getByRole("button", { name: "Last 30 days" }));
    await expect(
      canvas.getByRole("button", { name: "Last 30 days" }),
    ).toBeVisible();
  },
});
