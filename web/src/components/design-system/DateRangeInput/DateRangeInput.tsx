"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { format } from "date-fns";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "@langfuse/icons";
import {
  DayPicker,
  SelectionState,
  UI,
  type DateRange,
  type ChevronProps,
} from "react-day-picker";

import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { InputControl } from "../internal/InputControl/InputControl";
import { Input } from "../Input/Input";

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
  "date-range-input-field placeholder:text-muted-foreground min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-sm shadow-none outline-hidden focus:ring-0 disabled:cursor-not-allowed [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none [&::-moz-calendar-picker-indicator]:hidden";

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
    <div className="w-full max-w-full">
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
  const container = useLayerContainer("popover");
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<DateRange | undefined>(range);
  const label = presets.find((preset) => preset.value === value)?.label;
  const displayValue =
    value === customValue && range
      ? `${format(range.from, "LLL d, yy HH:mm")} – ${format(range.to, "LLL d, yy HH:mm")}`
      : (label ?? "Select date range");

  const selectDay = (day: Date) => {
    if (
      earliestDate &&
      day <
        new Date(
          earliestDate.getFullYear(),
          earliestDate.getMonth(),
          earliestDate.getDate(),
        )
    )
      return;
    if (!draft?.from || draft.to) {
      setDraft({ from: day, to: undefined });
      return;
    }
    const from = day < draft.from ? day : draft.from;
    const to = day < draft.from ? draft.from : day;
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const next = {
      from: earliestDate && start < earliestDate ? earliestDate : start,
      to: new Date(
        to.getFullYear(),
        to.getMonth(),
        to.getDate(),
        23,
        59,
        59,
        999,
      ),
    };
    setDraft(next);
    onCustomChange(next);
  };

  const changeTime = (boundary: "from" | "to", time: string) => {
    if (!draft?.from || !draft.to) return;
    const [hours, minutes] = time.split(":").map(Number);
    const updated = new Date(draft[boundary]!);
    updated.setHours(hours ?? 0, minutes ?? 0);
    if (boundary === "from" && earliestDate && updated < earliestDate) {
      updated.setTime(earliestDate.getTime());
    }
    const next = { from: draft.from, to: draft.to, [boundary]: updated };
    if (next.from > next.to) return;
    setDraft(next);
    onCustomChange(next);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen || !draft?.to) setDraft(range);
  };
  const handlePresetClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const preset = presets.find(
      (option) => option.value === event.currentTarget.value,
    );
    if (!preset) return;
    onPresetChange(preset.value);
    setOpen(false);
  };
  const handleTimeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const boundary = event.target.name;
    if (boundary === "from" || boundary === "to") {
      changeTime(boundary, event.target.value);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <InputControl contentLayout="spread" disabled={disabled}>
        <Popover.Trigger
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
        </Popover.Trigger>
      </InputControl>
      <Popover.Portal container={container}>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="bg-popover text-popover-foreground flex max-h-[min(90vh,650px)] max-w-[calc(100vw-2rem)] flex-col overflow-auto rounded-md border shadow-md sm:flex-row"
        >
          <div className="flex max-h-40 min-w-40 flex-col gap-0.5 overflow-auto border-b p-2 sm:max-h-none sm:border-r sm:border-b-0">
            {presets.map((preset) => (
              <button
                key={preset.value}
                type="button"
                value={preset.value}
                disabled={preset.disabled}
                aria-pressed={value === preset.value}
                className="hover:bg-muted aria-pressed:bg-primary/10 aria-pressed:text-primary aria-pressed:hover:bg-primary/15 rounded-sm px-3 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handlePresetClick}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div>
            <DayPicker
              mode="range"
              disabled={
                earliestDate
                  ? {
                      before: new Date(
                        earliestDate.getFullYear(),
                        earliestDate.getMonth(),
                        earliestDate.getDate(),
                      ),
                    }
                  : undefined
              }
              numberOfMonths={2}
              selected={draft}
              defaultMonth={draft?.from}
              onDayClick={selectDay}
              className="relative p-3 max-sm:[&_.rdp-months>.rdp-month:last-child]:hidden"
              classNames={{
                [UI.Months]: "flex gap-4",
                [UI.Month]: "space-y-4",
                [UI.MonthCaption]: "flex justify-center items-center h-8",
                [UI.CaptionLabel]: "text-sm font-bold",
                [UI.PreviousMonthButton]:
                  "absolute left-2 top-3 rounded p-1 hover:bg-accent",
                [UI.NextMonthButton]:
                  "absolute right-2 top-3 rounded p-1 hover:bg-accent",
                [UI.MonthGrid]: "w-full border-collapse",
                [UI.Weekdays]: "flex",
                [UI.Weekday]: "text-muted-foreground w-9 text-center text-xs",
                [UI.Week]: "flex",
                [UI.Day]: "size-9 text-center",
                [UI.DayButton]:
                  "size-9 rounded text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring group-[.range-start]:bg-primary group-[.range-start]:text-primary-foreground group-[.range-start]:hover:bg-primary/90 group-[.range-end]:bg-primary group-[.range-end]:text-primary-foreground group-[.range-end]:hover:bg-primary/90 group-[.range-middle]:hover:bg-primary/25",
                [SelectionState.range_start]:
                  "group range-start bg-primary/15 rounded-l-md",
                [SelectionState.range_middle]:
                  "group range-middle bg-primary/15",
                [SelectionState.range_end]:
                  "group range-end bg-primary/15 rounded-r-md",
              }}
              components={{
                Chevron: CalendarChevron,
              }}
            />
            <div className="flex flex-wrap gap-3 border-t p-3 text-sm">
              {(["from", "to"] as const).map((boundary) => (
                <label key={boundary} className="flex items-center gap-2">
                  {boundary === "from" ? "Start" : "End"}
                  <span className="w-32">
                    <Input
                      type="time"
                      name={boundary}
                      aria-label={`${boundary === "from" ? "Start" : "End"} time`}
                      disabled={!draft?.from || !draft.to}
                      value={
                        draft?.from && draft.to
                          ? format(draft[boundary]!, "HH:mm")
                          : ""
                      }
                      onChange={handleTimeChange}
                    />
                  </span>
                </label>
              ))}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function CalendarChevron({ orientation }: ChevronProps) {
  if (orientation === "right") return <ChevronRight size="base" />;
  return <ChevronLeft size="base" />;
}

export { DateRangeInput };
