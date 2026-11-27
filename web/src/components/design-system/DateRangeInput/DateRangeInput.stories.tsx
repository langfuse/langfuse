import { useState } from "react";
import { expect, fireEvent, fn, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { DateRangeInput, type DateRangeFieldValue } from "./DateRangeInput";

const fieldValue: DateRangeFieldValue = {
  from: "2026-08-31",
  to: "2026-09-07",
};

function indicatorIsHidden(doc: Document) {
  const visit = (rules: CSSRuleList): boolean => {
    for (const rule of rules) {
      if ("cssRules" in rule && rule.cssRules instanceof CSSRuleList) {
        if (visit(rule.cssRules)) return true;
      }
      const text = rule.cssText;
      if (
        text.includes("::-webkit-calendar-picker-indicator") &&
        text.includes("display: none")
      ) {
        return true;
      }
    }
    return false;
  };
  for (const sheet of doc.styleSheets) {
    try {
      if (visit(sheet.cssRules)) return true;
    } catch {
      continue;
    }
  }
  return false;
}

const fieldLabels = {
  variant: "fields" as const,
  fromLabel: "Start date",
  toLabel: "End date",
};

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
    onPresetChange: fn(),
    onCustomChange: fn(),
  },
  render: (args) => {
    const [value, setValue] = useState<string>(args.value);
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
    onPresetChange: fn(),
    onCustomChange: fn(),
  },
  render: (args) => {
    const [value, setValue] = useState<string>(args.value);
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

export const TestWholeDaySelection = meta.story({
  name: "(Test) Whole day includes the final millisecond",
  args: {
    value: "custom",
    customValue: "custom",
    range: {
      from: new Date(2026, 9, 20, 12),
      to: new Date(2026, 9, 21, 12),
    },
    presets: [],
    onPresetChange: fn(),
    onCustomChange: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Date range" }));
    const day = body.getByRole("button", {
      name: /Tuesday, October 20th, 2026/,
    });
    await userEvent.click(day);
    await userEvent.click(day);
    await expect(args.onCustomChange).toHaveBeenLastCalledWith({
      from: new Date(2026, 9, 20),
      to: new Date(2026, 9, 20, 23, 59, 59, 999),
    });
  },
});

export const TestEndTimeOutsideRollingLookback = meta.story({
  name: "(Test) End time remains editable outside the rolling lookback",
  args: {
    value: "custom",
    customValue: "custom",
    range: {
      from: new Date(2026, 9, 20, 12),
      to: new Date(2026, 9, 21, 12),
    },
    earliestDate: new Date(2026, 9, 20, 12, 0, 1),
    presets: [],
    onPresetChange: fn(),
    onCustomChange: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Date range" }));
    fireEvent.change(body.getByLabelText("End time"), {
      target: { value: "13:00" },
    });
    await expect(args.onCustomChange).toHaveBeenLastCalledWith({
      from: new Date(2026, 9, 20, 12),
      to: new Date(2026, 9, 21, 13),
    });
  },
});

export const TestStartTimeClampedToEarliest = meta.story({
  name: "(Test) Start time clamps to the earliest allowed timestamp",
  args: {
    value: "custom",
    customValue: "custom",
    range: {
      from: new Date(2026, 9, 20, 12),
      to: new Date(2026, 9, 21, 12),
    },
    earliestDate: new Date(2026, 9, 20, 11, 30, 1),
    presets: [],
    onPresetChange: fn(),
    onCustomChange: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Date range" }));
    fireEvent.change(body.getByLabelText("Start time"), {
      target: { value: "10:00" },
    });
    await expect(args.onCustomChange).toHaveBeenLastCalledWith({
      from: args.earliestDate,
      to: new Date(2026, 9, 21, 12),
    });
  },
});

export const FieldsEmpty = meta.story({
  name: "Fields, empty",
  args: {
    ...fieldLabels,
    value: { from: "", to: "" },
    onChange: fn(),
  },
});

export const FieldsSelected = meta.story({
  name: "Fields, selected",
  args: {
    ...fieldLabels,
    value: fieldValue,
    onChange: fn(),
  },
});

export const FieldsWithBounds = meta.story({
  name: "Fields, with bounds",
  args: {
    ...fieldLabels,
    value: fieldValue,
    min: "2026-03-07",
    max: "2026-09-07",
    onChange: fn(),
  },
});

export const FieldsDisabled = meta.story({
  name: "Fields, disabled",
  args: {
    ...fieldLabels,
    value: fieldValue,
    disabled: true,
    onChange: fn(),
  },
});

export const FieldsInvalid = meta.story({
  name: "Fields, invalid",
  args: {
    ...fieldLabels,
    value: fieldValue,
    error: true,
    onChange: fn(),
  },
});

export const TestFieldsEmitCompleteRange = meta.story({
  name: "(Test) Fields emit the complete range",
  args: {
    ...fieldLabels,
    value: fieldValue,
    min: "2026-03-07",
    max: "2026-09-07",
    onChange: fn(),
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <DateRangeInput
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

    await expect(
      canvas.getAllByRole("button", { name: "Open calendar" }),
    ).toHaveLength(1);
    await expect(frame?.querySelectorAll("svg")).toHaveLength(1);
    await expect(frame).toBe(end.parentElement);
    await expect(indicatorIsHidden(canvasElement.ownerDocument)).toBe(true);
    await expect(getComputedStyle(start).borderTopWidth).toBe("0px");
    await expect(getComputedStyle(frame!).borderTopWidth).not.toBe("0px");

    await expect(start).toHaveAttribute("min", "2026-03-07");
    await expect(start).toHaveAttribute("max", fieldValue.to);
    await expect(end).toHaveAttribute("min", fieldValue.from);
    await expect(end).toHaveAttribute("max", "2026-09-07");

    fireEvent.change(start, { target: { value: "2026-08-30" } });
    await expect(args.onChange).toHaveBeenLastCalledWith({
      from: "2026-08-30",
      to: fieldValue.to,
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
