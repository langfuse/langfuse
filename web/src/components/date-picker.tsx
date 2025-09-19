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
import { useEffect, useState, useCallback } from "react";
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

  const onCalendarSelection = (range?: RDPDateRange) => {
    const newRange = range
      ? {
          from: range.from ? setBeginningOfDay(range.from) : undefined,
          to: range.to ? setEndOfDay(range.to) : undefined,
        }
      : undefined;

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
      <Popover>
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
            initialFocus={true}
            mode="range"
            defaultMonth={internalDateRange?.from}
            selected={internalDateRange}
            onSelect={onCalendarSelection}
            numberOfMonths={2}
            className="[&>div:first-child]:block [&>div]:hidden [&>div]:sm:block"
            disabled={disabled}
          />
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
};

export function TimeRangePicker({
  className,
  timeRange,
  timeRangePresets,
  onTimeRangeChange,
  disabled,
}: TimeRangePickerProps) {
  // Determine the range type
  const rangeType: "named" | "custom" | null = timeRange
    ? "from" in timeRange
      ? "custom"
      : "named"
    : null;

  // Disable future dates by default, plus any additional disabled prop
  const calendarDisabled = React.useMemo(() => {
    const futureDisabled = { after: new Date() };

    if (!disabled) return futureDisabled;
    if (typeof disabled === "boolean") return disabled;

    // Always return an array when combining with additional restrictions
    const disabledArray = Array.isArray(disabled) ? disabled : [disabled];
    return [...disabledArray, futureDisabled] as React.ComponentProps<
      typeof Calendar
    >["disabled"];
  }, [disabled]);
  const namedRangeValue =
    rangeType === "named" && timeRange && "range" in timeRange
      ? timeRange.range
      : null;

  // Convert TimeRange to DateRange for internal use
  const dateRange = timeRange && "from" in timeRange ? timeRange : undefined;

  const [internalDateRange, setInternalDateRange] = useState<
    RDPDateRange | undefined
  >(dateRange);

  // Update internal date range when timeRange changes
  useEffect(() => {
    if (rangeType === "custom") {
      // Custom range - use as is
      setInternalDateRange(dateRange);
    } else if (rangeType === "named" && timeRange && "range" in timeRange) {
      // Preset range - look up in generic time ranges
      const setting = TIME_RANGES[timeRange.range as keyof typeof TIME_RANGES];
      if (setting && setting.minutes) {
        const now = new Date();
        setInternalDateRange({
          from: addMinutes(now, -setting.minutes),
          to: now,
        });
      } else {
        setInternalDateRange(undefined);
      }
    } else {
      setInternalDateRange(undefined);
    }
  }, [timeRange, dateRange, rangeType]);

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
      onTimeRangeChange({
        from: newRange.from,
        to: newRange.to,
      });
    }
  };

  const onCalendarSelection = (range?: RDPDateRange) => {
    const newRange = range
      ? {
          from: range.from
            ? setBeginningOfDay(new Date(range.from))
            : undefined,
          to: range.to ? setEndOfDay(new Date(range.to)) : undefined,
        }
      : undefined;

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

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (open) {
      setTab("presets");
    }
  }, []);

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
          <span className="h-5 w-10 rounded bg-muted px-1.5 text-center text-xs leading-5">
            {setting?.abbreviation || namedRangeValue}
          </span>
          <span>{setting?.label || namedRangeValue}</span>
        </div>
      );
    } else {
      // No time range selected
      return (
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4" />
          <span>Select time range</span>
        </div>
      );
    }
  };

  return (
    <div className={cn("my-3", className)}>
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-fit justify-start text-left font-normal hover:bg-accent hover:text-accent-foreground",
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
                defaultMonth={internalDateRange?.from || new Date()}
                selected={internalDateRange}
                onSelect={onCalendarSelection}
                numberOfMonths={1}
                disabled={calendarDisabled}
              />
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
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                    onClick={() => {
                      onPresetSelection(presetKey);
                      setIsOpen(false);
                    }}
                  >
                    <span className="h-5 w-10 rounded bg-muted px-1.5 text-center text-xs leading-5">
                      {setting.abbreviation}
                    </span>
                    <span>{setting.label}</span>
                  </div>
                );
              })}
              <div
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  setTab("calendar");
                }}
              >
                <span className="leading flex h-5 w-10 items-center justify-center rounded bg-muted px-1.5 text-center text-xs">
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
