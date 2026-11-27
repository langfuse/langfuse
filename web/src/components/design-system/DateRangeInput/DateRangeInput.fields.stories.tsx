import { useState, type ComponentProps } from "react";
import { expect, fireEvent, fn, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { DateRangeInput } from "./DateRangeInput";

type FieldsProps = Extract<
  ComponentProps<typeof DateRangeInput>,
  { variant: "fields" }
>;

function FieldsDateRangeInput(props: FieldsProps) {
  return <DateRangeInput {...props} />;
}

const fieldValue: FieldsProps["value"] = {
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

const meta = preview.meta({
  component: FieldsDateRangeInput,
  args: {
    variant: "fields" as const,
    fromLabel: "Start date",
    toLabel: "End date",
  },
});

export const FieldsEmpty = meta.story({
  name: "Fields, empty",
  args: {
    value: { from: "", to: "" },
    onChange: fn(),
  },
});

export const FieldsSelected = meta.story({
  name: "Fields, selected",
  args: {
    value: fieldValue,
    onChange: fn(),
  },
});

export const FieldsWithBounds = meta.story({
  name: "Fields, with bounds",
  args: {
    value: fieldValue,
    min: "2026-03-07",
    max: "2026-09-07",
    onChange: fn(),
  },
});

export const FieldsDisabled = meta.story({
  name: "Fields, disabled",
  args: {
    value: fieldValue,
    disabled: true,
    onChange: fn(),
  },
});

export const FieldsInvalid = meta.story({
  name: "Fields, invalid",
  args: {
    value: fieldValue,
    error: true,
    onChange: fn(),
  },
});

export const TestFieldsEmitCompleteRange = meta.story({
  name: "(Test) Fields emit the complete range",
  args: {
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
        onChange={(next: FieldsProps["value"]) => {
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
