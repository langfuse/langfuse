import { useState } from "react";
import { expect, fireEvent, fn, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { DateRangeFields, type DateRangeFieldsValue } from "./DateRangeFields";

const meta = preview.meta({ component: DateRangeFields });

const selected: DateRangeFieldsValue = {
  from: "2026-08-31",
  to: "2026-09-07",
};

const labels = {
  fromLabel: "Start date",
  toLabel: "End date",
};

export const Empty = meta.story({
  args: {
    ...labels,
    value: { from: "", to: "" },
    onChange: fn(),
  },
});

export const Selected = meta.story({
  args: {
    ...labels,
    value: selected,
    onChange: fn(),
  },
});

export const WithBounds = meta.story({
  args: {
    ...labels,
    value: selected,
    min: "2026-03-07",
    max: "2026-09-07",
    onChange: fn(),
  },
});

export const Disabled = meta.story({
  args: {
    ...labels,
    value: selected,
    disabled: true,
    onChange: fn(),
  },
});

export const Invalid = meta.story({
  args: {
    ...labels,
    value: selected,
    error: true,
    onChange: fn(),
  },
});

export const TestEmitsCompleteRange = meta.story({
  name: "(Test) Emits the complete range",
  args: {
    ...labels,
    value: selected,
    min: "2026-03-07",
    max: "2026-09-07",
    onChange: fn(),
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <DateRangeFields
        {...args}
        value={value}
        onChange={(next) => {
          setValue(next);
          args.onChange(next);
        }}
      />
    );
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const start = canvas.getByLabelText("Start date");
    const end = canvas.getByLabelText("End date");
    const frame = start.parentElement;

    await expect(frame).toBe(end.parentElement);
    await expect(getComputedStyle(start).borderTopWidth).toBe("0px");
    await expect(getComputedStyle(frame!).borderTopWidth).not.toBe("0px");

    await expect(start).toHaveAttribute("min", "2026-03-07");
    await expect(start).toHaveAttribute("max", selected.to);
    await expect(end).toHaveAttribute("min", selected.from);
    await expect(end).toHaveAttribute("max", "2026-09-07");

    fireEvent.change(start, { target: { value: "2026-08-30" } });
    await expect(args.onChange).toHaveBeenLastCalledWith({
      from: "2026-08-30",
      to: selected.to,
    });

    fireEvent.change(end, { target: { value: "2026-09-06" } });
    await expect(args.onChange).toHaveBeenLastCalledWith({
      from: "2026-08-30",
      to: "2026-09-06",
    });

    fireEvent.change(start, { target: { value: "" } });
    await expect(args.onChange).toHaveBeenCalledTimes(2);
  },
});
