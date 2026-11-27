"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarDays, ChevronDown } from "@langfuse/icons";

import { InputControl } from "../internal/InputControl/InputControl";
import { DateRangePicker } from "../DateRangePicker/DateRangePicker";

export type DateRangeFieldValue = {
  from: string;
  to: string;
};

type PresetDateRangeInputProps<V extends string> = {
  variant?: "preset";
  value: V;
  customValue: V;
  range?: { from: Date; to: Date };
  earliestDate?: Date;
  presets: { value: V; label: string; disabled?: boolean }[];
  onPresetChange: (value: V) => void;
  onCustomChange: (range: { from: Date; to: Date }) => void;
  id?: string;
  "aria-describedby"?: string;
  disabled?: boolean;
};

type FieldsDateRangeInputProps = {
  variant: "fields";
  value: DateRangeFieldValue;
  onChange: (value: DateRangeFieldValue) => void;
  /** Earliest selectable day (`yyyy-MM-dd`) for the start field. */
  min?: string;
  /** Latest selectable day (`yyyy-MM-dd`) for the end field. */
  max?: string;
  fromLabel: string;
  toLabel: string;
  disabled?: boolean;
  error?: boolean;
};

type DateRangeInputProps<V extends string> =
  | PresetDateRangeInputProps<V>
  | FieldsDateRangeInputProps;

const dateFieldClassName =
  "placeholder:text-muted-foreground min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-sm shadow-none outline-hidden focus:ring-0 disabled:cursor-not-allowed [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none";

function DateRangeInput<V extends string>(props: DateRangeInputProps<V>) {
  if (props.variant === "fields") return <DateRangeFieldsVariant {...props} />;
  return <DateRangePreset {...props} />;
}

function DateRangeFieldsVariant({
  value,
  onChange,
  min,
  max,
  fromLabel,
  toLabel,
  disabled,
  error,
}: FieldsDateRangeInputProps) {
  const fromRef = React.useRef<HTMLInputElement>(null);
  const toRef = React.useRef<HTMLInputElement>(null);
  const [pickerField, setPickerField] = React.useState<"from" | "to">("from");

  const changeBoundary = (boundary: "from" | "to", next: string) => {
    if (next === "") return;
    onChange({ ...value, [boundary]: next });
  };
  const handleFromChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    changeBoundary("from", event.target.value);
  };
  const handleToChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    changeBoundary("to", event.target.value);
  };
  const openCalendar = () => {
    const input = (pickerField === "to" ? toRef : fromRef).current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  };

  return (
    <div className="w-fit max-w-full">
      <InputControl
        contentLayout="text"
        height="fixed"
        focusTarget="within"
        error={error}
        disabled={disabled}
      >
        <div className="flex w-full items-center gap-2">
          <button
            type="button"
            aria-label="Open calendar"
            className="focus-visible:ring-ring flex shrink-0 items-center rounded-sm focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset disabled:cursor-not-allowed"
            disabled={disabled}
            onClick={openCalendar}
          >
            <CalendarDays
              aria-hidden="true"
              size="base"
              color={disabled ? "muted" : "default"}
            />
          </button>
          <input
            ref={fromRef}
            aria-invalid={error ? true : undefined}
            aria-label={fromLabel}
            className={dateFieldClassName}
            data-1p-ignore
            type="date"
            value={value.from}
            min={min}
            max={value.to === "" ? max : value.to}
            disabled={disabled}
            onFocus={() => setPickerField("from")}
            onChange={handleFromChange}
          />
          <span className="text-muted-foreground shrink-0" aria-hidden="true">
            →
          </span>
          <input
            ref={toRef}
            aria-invalid={error ? true : undefined}
            aria-label={toLabel}
            className={dateFieldClassName}
            data-1p-ignore
            type="date"
            value={value.to}
            min={value.from === "" ? min : value.from}
            max={max}
            disabled={disabled}
            onFocus={() => setPickerField("to")}
            onChange={handleToChange}
          />
        </div>
      </InputControl>
    </div>
  );
}

function DateRangePreset<V extends string>({
  value,
  customValue,
  range,
  earliestDate,
  presets,
  onPresetChange,
  onCustomChange,
  id,
  "aria-describedby": ariaDescribedBy,
  disabled,
}: PresetDateRangeInputProps<V>) {
  const label = presets.find((preset) => preset.value === value)?.label;
  const displayValue =
    value === customValue && range
      ? `${format(range.from, "LLL d, yy HH:mm")} – ${format(range.to, "LLL d, yy HH:mm")}`
      : (label ?? "Select date range");

  return (
    <DateRangePicker
      value={value}
      customValue={customValue}
      range={range}
      earliestDate={earliestDate}
      presets={presets}
      onPresetChange={onPresetChange}
      onCustomChange={onCustomChange}
    >
      <InputControl contentLayout="spread" disabled={disabled}>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-label="Date range"
          aria-describedby={ariaDescribedBy}
        >
          <span
            className="flex min-w-0 items-center gap-2 truncate text-left"
            title={displayValue}
          >
            <CalendarDays size="base" />
            {displayValue}
          </span>
          <ChevronDown size="base" color="muted" />
        </button>
      </InputControl>
    </DateRangePicker>
  );
}

export { DateRangeInput };
