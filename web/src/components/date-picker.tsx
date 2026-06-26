"use client";

import * as React from "react";
import { Calendar as CalendarIcon, X, ChevronDown } from "lucide-react";
import { addMinutes } from "date-fns";
import { Button } from "@/src/components/ui/button";
import { Calendar } from "@/src/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { cn } from "@/src/utils/tailwind";
import { type DateRange as RDPDateRange } from "react-day-picker";
import { format } from "date-fns";
import { useEffect, useMemo, useState, useCallback } from "react";
import { setBeginningOfDay, setEndOfDay } from "@/src/utils/dates";
import { TimePicker } from "@/src/components/ui/time-picker";
import { DashboardDateRangeDropdown } from "@/src/components/date-range-dropdowns";
import {
  DASHBOARD_AGGREGATION_PLACEHOLDER,
  type DashboardDateRangeOptions,
  type DashboardDateRange,
  TIME_RANGES,
  formatDateRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";
import { combineDateAndTime } from "@/src/components/ui/time-picker-utils";

export function DatePicker({
  date,
  onChange,
  clearable = false,
  className,
  disabled,
  includeTimePicker,
}: {
  date?: Date | undefined;
  onChange: (date: Date | undefined) => void;
  clearable?: boolean;
  className?: string;
  disabled?: boolean;
  includeTimePicker?: boolean;
}) {
  return (
    <div className="flex flex-row gap-2 align-middle">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={"outline"}
            disabled={disabled}
            className={cn(
              "justify-start text-left font-normal",
              !date && "text-muted-foreground",
              className,
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? (
              format(date, includeTimePicker ? "PPP pp" : "PPP")
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => onChange(d)}
            autoFocus
          />
          {includeTimePicker && (
            <TimePicker date={date} setDate={(d) => onChange(d)} />
          )}
        </PopoverContent>
      </Popover>
      {date && clearable && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onChange(undefined)}
          title="reset date"
        >
          <X size={14} />
        </Button>
      )}
    </div>
  );
}

export type DatePickerWithRangeProps = {
  dateRange?: DashboardDateRange;
  className?: string;
  selectedOption: DashboardDateRangeOptions;
  disabled?: React.ComponentProps<typeof Calendar>["disabled"];
  setDateRangeAndOption: (
    option: DashboardDateRangeOptions,
    date?: DashboardDateRange,
  ) => void;
};

/**
 * Computes the next range for a calendar day click so the FIRST click always
 * starts a new range and the SECOND click sets the end (LFE-8156). The decision
 * is driven by the clicked day, not by react-day-picker's range state machine,
 * which otherwise extends a complete range (the original "sticky" bug), clears
 * the selection when the single day of a same-day range is re-clicked, or
 * extends a left-over start that survived a closed popover.
 */
export function nextRangeForDayClick(
  current: RDPDateRange | undefined,
  clickedDay: Date,
): { from: Date; to: Date | undefined } {
  // Mid-selection — a start without an end → this click sets the end (swapping
  // if the click lands before the start).
  if (current?.from && !current.to) {
    return clickedDay < current.from
      ? { from: clickedDay, to: current.from }
      : { from: current.from, to: clickedDay };
  }
  // Empty or a complete range → start a fresh range; the end stays orphaned
  // until the next click.
  return { from: clickedDay, to: undefined };
}

export function isRangeWithinMaxDuration(
  range: RDPDateRange | undefined,
  maxDurationMs: number | undefined,
): boolean {
  if (!range?.from || !range.to || maxDurationMs === undefined) return true;
  return range.to.getTime() - range.from.getTime() <= maxDurationMs;
}

export function DatePickerWithRange({
  className,
  dateRange,
  selectedOption,
  setDateRangeAndOption,
  disabled,
}: DatePickerWithRangeProps) {
  const [internalDateRange, setInternalDateRange] = useState<
    RDPDateRange | undefined
  >(dateRange);

  useEffect(() => {
    setInternalDateRange(dateRange);
  }, [dateRange]);

  const setNewDateRange = (
    internalDateRange: RDPDateRange | undefined,
    newFromDate: Date | undefined,
    newToDate: Date | undefined,
  ): RDPDateRange | undefined => {
    return internalDateRange
      ? {
          from: newFromDate ?? internalDateRange.from,
          to: newToDate ?? internalDateRange.to,
        }
      : undefined;
  };

  const updateDashboardDateRange = (
    newRange: RDPDateRange | undefined,
    setDateRangeAndOption: (
      option: DashboardDateRangeOptions,
      date?: DashboardDateRange,
    ) => void,
  ) => {
    if (newRange && newRange.from && newRange.to) {
      const dashboardDateRange: DashboardDateRange = {
        from: newRange.from,
        to: newRange.to,
      };
      setDateRangeAndOption(
        DASHBOARD_AGGREGATION_PLACEHOLDER,
        dashboardDateRange,
      );
    }
  };

  const onCalendarSelection = (triggerDay?: Date) => {
    if (!triggerDay) return;
    const next = nextRangeForDayClick(internalDateRange, triggerDay);
    const newRange: RDPDateRange = {
      from: setBeginningOfDay(next.from),
      to: next.to ? setEndOfDay(next.to) : undefined,
    };
    setInternalDateRange(newRange);
    updateDashboardDateRange(newRange, setDateRangeAndOption);
  };

  const onStartTimeSelection = (date: Date | undefined) => {
    const newDateTime = combineDateAndTime(internalDateRange?.from, date);
    const newRange = setNewDateRange(
      internalDateRange,
      newDateTime,
      internalDateRange?.to,
    );
    setInternalDateRange(newRange);
    updateDashboardDateRange(newRange, setDateRangeAndOption);
  };

  const onEndTimeSelection = (date: Date | undefined) => {
    const newDateTime = combineDateAndTime(internalDateRange?.to, date);
    const newRange = setNewDateRange(
      internalDateRange,
      internalDateRange?.from,
      newDateTime,
    );
    setInternalDateRange(newRange);
    updateDashboardDateRange(newRange, setDateRangeAndOption);
  };

  return (
    <div
      className={cn("my-3 flex flex-col-reverse gap-2 md:flex-row", className)}
    >
      <Popover
        onOpenChange={(open) => {
          // Discard an abandoned first click on close so the next open starts
          // fresh instead of extending a left-over start (LFE-8156).
          if (!open && internalDateRange?.from && !internalDateRange.to) {
            setInternalDateRange(dateRange);
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-[330px] justify-start text-left font-normal",
              !internalDateRange && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {internalDateRange?.from ? (
              internalDateRange.to ? (
                <>
                  {format(internalDateRange.from, "LLL dd, yy : HH:mm")} -{" "}
                  {format(internalDateRange.to, "LLL dd, yy : HH:mm")}
                </>
              ) : (
                format(internalDateRange.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            autoFocus={true}
            mode="range"
            // First click starts a new range, second sets the end — see
            // onCalendarSelection / nextRangeForDayClick (LFE-8156).
            defaultMonth={internalDateRange?.from}
            selected={internalDateRange}
            onSelect={(_, triggerDay) => onCalendarSelection(triggerDay)}
            numberOfMonths={2}
            // react-day-picker v9 lays the two months out in a flex row; on
            // narrow screens drop the second month rather than overriding that
            // flex (the old `[&>div]` rule stacked them vertically). LFE-8156.
            className="max-sm:[&>div>div:last-child]:hidden"
            disabled={disabled}
          />
          {/* Time pickers tune the boundaries of a *complete* range. During
              the partial range (after the first click, before the second) they
              are hidden: the End-time input would silently ignore edits, and a
              typed Start time would be clobbered by setBeginningOfDay on the
              next calendar click. See LFE-8156. */}
          {internalDateRange?.from && internalDateRange.to && (
            <div className="flex flex-col gap-2 border-t-2 py-1.5 sm:flex-row sm:gap-0">
              <div className="px-3">
                <p className="px-1 text-sm font-medium">
                  Start<span className="hidden sm:inline"> time</span>
                </p>
                <TimePicker
                  date={internalDateRange?.from}
                  setDate={onStartTimeSelection}
                  className="border-0 px-0 pt-1"
                />
              </div>
              <div className="px-3">
                <p className="px-1 text-sm font-medium">
                  End<span className="hidden sm:inline"> time</span>
                </p>
                <TimePicker
                  date={internalDateRange?.to}
                  setDate={onEndTimeSelection}
                  className="border-0 px-0 pt-1"
                />
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
      <DashboardDateRangeDropdown
        selectedOption={selectedOption}
        setDateRangeAndOption={setDateRangeAndOption}
      />
    </div>
  );
}

export type TimeRangePickerProps = {
  timeRange?: TimeRange;
  onTimeRangeChange: (timeRange: TimeRange) => void;
  timeRangePresets: readonly string[];
  className?: string;
  disabled?: boolean | { before?: Date; after?: Date } | Date | Date[];
  maxRangeMs?: number;
};

export function TimeRangePicker({
  className,
  timeRange,
  timeRangePresets,
  onTimeRangeChange,
  disabled,
  maxRangeMs,
}: TimeRangePickerProps) {
  // Determine the range type
  const rangeType: "named" | "custom" | null = timeRange
    ? "from" in timeRange
      ? "custom"
      : "named"
    : null;

  const namedRangeValue =
    rangeType === "named" && timeRange && "range" in timeRange
      ? timeRange.range
      : null;

  // Convert TimeRange to DateRange for internal use
  const dateRange = timeRange && "from" in timeRange ? timeRange : undefined;

  // The committed range expressed as a react-day-picker DateRange: a custom
  // range as-is, a named preset as its current absolute window (presets
  // re-evaluate to "now"), otherwise none. Reused to reset the editable range
  // when the popover closes mid-selection.
  const committedDateRange = useMemo<RDPDateRange | undefined>(() => {
    if (rangeType === "custom") {
      return dateRange;
    }
    if (rangeType === "named" && timeRange && "range" in timeRange) {
      const setting = TIME_RANGES[timeRange.range as keyof typeof TIME_RANGES];
      if (setting && setting.minutes) {
        const now = new Date();
        return { from: addMinutes(now, -setting.minutes), to: now };
      }
    }
    return undefined;
  }, [rangeType, timeRange, dateRange]);

  const [internalDateRange, setInternalDateRange] = useState<
    RDPDateRange | undefined
  >(committedDateRange);

  // Re-sync the editable range whenever the committed selection changes.
  useEffect(() => {
    setInternalDateRange(committedDateRange);
  }, [committedDateRange]);

  // Disable future dates by default, plus any additional disabled prop.
  // When a custom range is mid-selection, also disable days that would complete
  // a range longer than the caller's maximum duration.
  const calendarDisabled = React.useMemo(() => {
    const futureDisabled = { after: new Date() };

    if (typeof disabled === "boolean") return disabled;

    const disabledArray = disabled
      ? Array.isArray(disabled)
        ? disabled
        : [disabled]
      : [];
    const maxRangeDisabled =
      maxRangeMs !== undefined &&
      internalDateRange?.from &&
      !internalDateRange.to
        ? [
            {
              before: new Date(
                setEndOfDay(internalDateRange.from).getTime() - maxRangeMs + 1,
              ),
            },
            {
              after: new Date(
                setBeginningOfDay(internalDateRange.from).getTime() +
                  maxRangeMs -
                  1,
              ),
            },
          ]
        : [];

    return [
      ...disabledArray,
      futureDisabled,
      ...maxRangeDisabled,
    ] as React.ComponentProps<typeof Calendar>["disabled"];
  }, [disabled, internalDateRange, maxRangeMs]);

  const setNewDateRange = (
    internalDateRange: RDPDateRange | undefined,
    newFromDate: Date | undefined,
    newToDate: Date | undefined,
  ): RDPDateRange | undefined => {
    return internalDateRange
      ? {
          from: newFromDate ?? internalDateRange.from,
          to: newToDate ?? internalDateRange.to,
        }
      : undefined;
  };

  const updateDateRange = (newRange: RDPDateRange | undefined) => {
    if (newRange && newRange.from && newRange.to) {
      if (!isRangeWithinMaxDuration(newRange, maxRangeMs)) return;

      onTimeRangeChange({
        from: newRange.from,
        to: newRange.to,
      });
    }
  };

  const onCalendarSelection = (triggerDay?: Date) => {
    if (!triggerDay) return;
    const next = nextRangeForDayClick(internalDateRange, triggerDay);
    const newRange: RDPDateRange = {
      from: setBeginningOfDay(next.from),
      to: next.to ? setEndOfDay(next.to) : undefined,
    };
    if (!isRangeWithinMaxDuration(newRange, maxRangeMs)) return;

    setInternalDateRange(newRange);
    updateDateRange(newRange);
  };

  const onStartTimeSelection = (date: Date | undefined) => {
    const newDateTime = combineDateAndTime(internalDateRange?.from, date);
    const newRange = setNewDateRange(
      internalDateRange,
      newDateTime,
      internalDateRange?.to,
    );
    if (!isRangeWithinMaxDuration(newRange, maxRangeMs)) return;

    setInternalDateRange(newRange);
    updateDateRange(newRange);
  };

  const onEndTimeSelection = (date: Date | undefined) => {
    const newDateTime = combineDateAndTime(internalDateRange?.to, date);
    const newRange = setNewDateRange(
      internalDateRange,
      internalDateRange?.from,
      newDateTime,
    );
    if (!isRangeWithinMaxDuration(newRange, maxRangeMs)) return;

    setInternalDateRange(newRange);
    updateDateRange(newRange);
  };

  const onPresetSelection = (value: string) => {
    if (timeRangePresets.includes(value as keyof typeof TIME_RANGES)) {
      onTimeRangeChange({ range: value });
    }
  };

  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<"presets" | "calendar">("presets");

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (open) {
        setTab("presets");
      } else if (internalDateRange?.from && !internalDateRange.to) {
        // Discard an abandoned first click so the next open starts fresh
        // instead of extending a left-over start (LFE-8156).
        setInternalDateRange(committedDateRange);
      }
    },
    [internalDateRange, committedDateRange],
  );

  const getDisplayContent = () => {
    if (rangeType === "custom") {
      // Custom range - show calendar icon and date range
      return (
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4" />
          <span>
            {dateRange
              ? formatDateRange(dateRange.from, dateRange.to)
              : "Select from calendar"}
          </span>
        </div>
      );
    } else if (rangeType === "named") {
      // Preset range - show badge with abbreviation and label
      const setting = TIME_RANGES[namedRangeValue as keyof typeof TIME_RANGES];
      return (
        <div className="flex items-center gap-2">
          <span className="bg-muted h-5 w-10 rounded px-1.5 text-center text-xs leading-5">
            {setting?.abbreviation || namedRangeValue}
          </span>
          <span>{setting?.label || namedRangeValue}</span>
        </div>
      );
    }
    // No time range selected
    return (
      <div className="flex items-center gap-2">
        <CalendarIcon className="h-4 w-4" />
        <span>Select time range</span>
      </div>
    );
  };

  return (
    <div className={cn("my-3", className)}>
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "hover:bg-accent hover:text-accent-foreground w-fit justify-start text-left font-normal",
              !timeRange && "text-muted-foreground",
            )}
          >
            <div className="flex items-center gap-2">
              {getDisplayContent()}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          {tab === "calendar" ? (
            /* Show calendar picker when in calendar mode */
            <>
              <Calendar
                mode="range"
                // First click starts a new range, second sets the end — see
                // onCalendarSelection / nextRangeForDayClick (LFE-8156).
                defaultMonth={internalDateRange?.from || new Date()}
                selected={internalDateRange}
                onSelect={(_, triggerDay) => onCalendarSelection(triggerDay)}
                numberOfMonths={1}
                disabled={calendarDisabled}
              />
              {/* Time pickers tune the boundaries of a *complete* range.
                  During the partial range (after the first click, before the
                  second) they are hidden: the End-time input would silently
                  ignore edits, and a typed Start time would be clobbered by
                  setBeginningOfDay on the next calendar click. See LFE-8156. */}
              {internalDateRange?.from && internalDateRange.to && (
                <div className="flex flex-col gap-3 border-t p-3">
                  <div className="flex flex-col gap-1">
                    <p className="px-1 text-sm font-medium">Start time</p>
                    <TimePicker
                      date={internalDateRange?.from}
                      setDate={onStartTimeSelection}
                      className="border-0 px-0 py-0"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="px-1 text-sm font-medium">End time</p>
                    <TimePicker
                      date={internalDateRange?.to}
                      setDate={onEndTimeSelection}
                      className="border-0 px-0 py-0"
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Always show preset options dropdown */
            <div className="p-1">
              {timeRangePresets.map((presetKey) => {
                const setting =
                  TIME_RANGES[presetKey as keyof typeof TIME_RANGES];
                return (
                  <div
                    key={presetKey}
                    className="hover:bg-accent hover:text-accent-foreground flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm"
                    onClick={() => {
                      onPresetSelection(presetKey);
                      setIsOpen(false);
                    }}
                  >
                    <span className="bg-muted h-5 w-10 rounded px-1.5 text-center text-xs leading-5">
                      {setting.abbreviation}
                    </span>
                    <span>{setting.label}</span>
                  </div>
                );
              })}
              <div
                className="hover:bg-accent hover:text-accent-foreground flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm"
                onClick={() => {
                  setTab("calendar");
                }}
              >
                <span className="bg-muted flex h-5 w-10 items-center justify-center rounded px-1.5 text-center text-xs">
                  <CalendarIcon className="h-3 w-3" />
                </span>
                <span>Select from calendar</span>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
