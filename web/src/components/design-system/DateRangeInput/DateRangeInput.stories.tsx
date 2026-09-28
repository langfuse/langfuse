import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { DateRangeInput } from "./DateRangeInput";

const meta = preview.meta({ component: DateRangeInput });

export const Default = meta.story({
  args: {
    value: "last7Days",
    customValue: "custom",
    presets: [
      { value: "last24Hours", label: "Last 24 hours" },
      { value: "last7Days", label: "Last 7 days" },
      { value: "last30Days", label: "Last 30 days" },
      { value: "last90Days", label: "Last 90 days", disabled: true },
    ],
    onPresetChange: () => {},
    onCustomChange: () => {},
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    const [range, setRange] = useState<{ from: Date; to: Date }>();

    return (
      <DateRangeInput
        {...args}
        value={value}
        range={range}
        onPresetChange={setValue}
        onCustomChange={(next) => {
          setRange(next);
          setValue(args.customValue);
        }}
      />
    );
  },
});

export const TestPresetSelection = meta.story({
  name: "(Test) Preset selection",
  args: {
    value: "last7Days",
    customValue: "custom",
    presets: [
      { value: "last7Days", label: "Last 7 days" },
      { value: "last30Days", label: "Last 30 days" },
    ],
    onPresetChange: () => {},
    onCustomChange: () => {},
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <DateRangeInput {...args} value={value} onPresetChange={setValue} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Date range" }));
    await expect(body.getByLabelText("Start time")).toBeDisabled();
    await expect(body.getByLabelText("End time")).toBeDisabled();
    await userEvent.click(body.getByRole("button", { name: "Last 30 days" }));
    await expect(
      canvas.getByRole("button", { name: "Date range" }),
    ).toHaveTextContent("Last 30 days");
  },
});
