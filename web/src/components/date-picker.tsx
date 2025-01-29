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
import { setBeginningOfDay, setEndOfDay } from "@/src/utils/dates";
import { TimePicker } from "@/src/components/ui/time-picker";
import { DashboardDateRangeDropdown } from "@/src/components/date-range-dropdowns";
import {
  DASHBOARD_AGGREGATION_PLACEHOLDER,
  type DashboardDateRangeOptions,
  type DashboardDateRange,
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
            numberOfMonths={isSmallScreen ? 1 : 2}
            disabled={disabled}
          />
          {!isSmallScreen && (
            <div className="flex flex-row border-t-2 py-1.5">
              <div className="px-3">
                <p className="px-1 text-sm font-medium">Start time</p>
                <TimePicker
                  date={internalDateRange?.from}
                  setDate={onStartTimeSelection}
                  className="border-0 px-0 pt-1"
                />
              </div>
              <div className="px-3">
                <p className="px-1 text-sm font-medium">End time</p>
                <TimePicker
                  date={internalDateRange?.to}
                  setDate={onEndTimeSelection}
                  className="border-0 px-0 pt-1"
                />
              </div>
            </div>
          )}
          {isSmallScreen && (
            <div className="flex flex-col gap-2 border-t-2 py-1.5">
              <div className="px-3">
                <p className="px-1 text-sm font-medium">Start</p>
                <TimePicker
                  date={internalDateRange?.from}
                  setDate={onStartTimeSelection}
                  className="border-0 px-0 pt-1"
                />
              </div>
              <div className="px-3">
                <p className="px-1 text-sm font-medium">End</p>
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
