"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { format } from "date-fns";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  DayPicker,
  SelectionState,
  UI,
  type DateRange,
} from "react-day-picker";

import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { InputControl } from "../internal/InputControl/InputControl";
import { Input } from "../Input/Input";

type DateRangeInputProps<V extends string> = {
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

function DateRangeInput<V extends string>({
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
}: DateRangeInputProps<V>) {
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
      to: new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59),
    };
    setDraft(next);
    onCustomChange(next);
  };

  const changeTime = (boundary: "from" | "to", time: string) => {
    if (!draft?.from || !draft.to) return;
    const [hours, minutes] = time.split(":").map(Number);
    const updated = new Date(draft[boundary]!);
    updated.setHours(hours ?? 0, minutes ?? 0);
    const next = { from: draft.from, to: draft.to, [boundary]: updated };
    if (next.from > next.to || (earliestDate && next.from < earliestDate))
      return;
    setDraft(next);
    onCustomChange(next);
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen || !draft?.to) setDraft(range);
      }}
    >
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
            <CalendarDays className="size-4 shrink-0" />
            {displayValue}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
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
                disabled={preset.disabled}
                aria-pressed={value === preset.value}
                className="hover:bg-muted aria-pressed:bg-primary/10 aria-pressed:text-primary aria-pressed:hover:bg-primary/15 rounded-sm px-3 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  onPresetChange(preset.value);
                  setOpen(false);
                }}
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
                Chevron: ({ orientation }) =>
                  orientation === "right" ? (
                    <ChevronRight className="size-4" />
                  ) : (
                    <ChevronLeft className="size-4" />
                  ),
              }}
            />
            <div className="flex flex-wrap gap-3 border-t p-3 text-sm">
              {(["from", "to"] as const).map((boundary) => (
                <label key={boundary} className="flex items-center gap-2">
                  {boundary === "from" ? "Start" : "End"}
                  <span className="w-32">
                    <Input
                      type="time"
                      aria-label={`${boundary === "from" ? "Start" : "End"} time`}
                      disabled={!draft?.from || !draft.to}
                      value={
                        draft?.from && draft.to
                          ? format(draft[boundary]!, "HH:mm")
                          : ""
                      }
                      onChange={(event) =>
                        changeTime(boundary, event.target.value)
                      }
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

export { DateRangeInput };
