"use client";

import * as React from "react";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Calendar } from "@/src/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { cn } from "@/src/utils/tailwind";
import { type DateRange } from "react-day-picker";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { useMediaQuery } from "react-responsive";
import { type DashboardDateRange } from "@/src/pages/project/[projectId]";
import { setBeginningOfDay, setEndOfDay } from "@/src/utils/dates";
import { TimePicker } from "@/src/components/ui/time-picker";
import DateRangeDropdown from "@/src/components/DateRangeDropdown";
import {
  DASHBOARD_AGGREGATION_PLACEHOLDER,
  type DateRangeOptions,
} from "@/src/utils/date-range-utils";

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
            initialFocus
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
  selectedOption: DateRangeOptions;
  setDateRangeAndOption: (
    option: DateRangeOptions,
    date?: DashboardDateRange,
  ) => void;
};

export function DatePickerWithRange({
  className,
  dateRange,
  selectedOption,
  setDateRangeAndOption,
}: DatePickerWithRangeProps) {
  const [internalDateRange, setInternalDateRange] = useState<
    DateRange | undefined
  >(dateRange);

  useEffect(() => {
    setInternalDateRange(dateRange);
  }, [dateRange]);

  const setNewDateRange = (
    internalDateRange: DateRange | undefined,
    newFromDate: Date | undefined,
    newToDate: Date | undefined,
  ): DateRange | undefined => {
    return internalDateRange
      ? {
          from: newFromDate ?? internalDateRange.from,
          to: newToDate ?? internalDateRange.to,
        }
      : undefined;
  };

  const updateDashboardDateRange = (
    newRange: DateRange | undefined,
    setDateRangeAndOption: (
      option: DateRangeOptions,
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

  const onCalendarSelection = (range?: DateRange) => {
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
    const startDate = internalDateRange?.from;
    const startTime = date;
    // Combine the date and time
    const newDateTime = startDate
      ? new Date(
          startDate.getFullYear(),
          startDate.getMonth(),
          startDate.getDate(),
          startTime?.getHours() ?? 0,
          startTime?.getMinutes() ?? 0,
          startTime?.getSeconds() ?? 0,
        )
      : undefined;
    const newRange = setNewDateRange(
      internalDateRange,
      newDateTime,
      internalDateRange?.to,
    );
    setInternalDateRange(newRange);
    updateDashboardDateRange(newRange, setDateRangeAndOption);
  };

  const onEndTimeSelection = (date: Date | undefined) => {
    const endDate = internalDateRange?.to;
    const endTime = date;
    const newDateTime = endDate
      ? new Date(
          endDate.getFullYear(),
          endDate.getMonth(),
          endDate.getDate(),
          endTime?.getHours() ?? 0,
          endTime?.getMinutes() ?? 0,
          endTime?.getSeconds() ?? 0,
        )
      : undefined;
    const newRange = setNewDateRange(
      internalDateRange,
      internalDateRange?.from,
      newDateTime,
    );
    setInternalDateRange(newRange);
    updateDashboardDateRange(newRange, setDateRangeAndOption);
  };

  const isSmallScreen = useMediaQuery({ query: "(max-width: 640px)" });

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
            numberOfMonths={isSmallScreen ? 1 : 2} // TODO: make this configurable to screen size
          />
          {!isSmallScreen && (
            <div className="flex flex-row border-t-2 pt-2">
              <div className="px-3">
                <p className="px-1">Start time</p>
                <TimePicker
                  date={internalDateRange?.from}
                  setDate={onStartTimeSelection}
                  className="border-0 px-0 pt-1"
                />
              </div>
              <div className="px-3">
                <p className="px-1">End time</p>
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
      <DateRangeDropdown
        type="dashboard"
        selectedOption={selectedOption}
        setDateRangeAndOption={setDateRangeAndOption}
      />
    </div>
  );
}
