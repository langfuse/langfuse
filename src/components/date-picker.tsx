"use client";

import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Calendar } from "@/src/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { cn } from "@/src/utils/tailwind";
import { type DateRange } from "react-day-picker";
import { addMinutes, format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { useState } from "react";
import {
  type DateTimeAggregationOption,
  findClosestInterval,
  dateTimeAggregationSettings,
  dateTimeAggregationOptions,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import { useMediaQuery } from "react-responsive";

export function DatePicker({
  date,
  onChange,
  className,
}: {
  date?: Date | undefined;
  onChange: (date: Date | undefined) => void;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "justify-start text-left font-normal",
            !date && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "PPP") : <span>Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => onChange(d)}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export type DatePickerWithRangeProps = {
  dateRange?: DateRange;
  setDateRange: (date?: DateRange) => void;
  className?: string;
  setAgg: (agg: DateTimeAggregationOption) => void;
};

export function DatePickerWithRange({
  className,
  dateRange,
  setDateRange,
  setAgg,
}: DatePickerWithRangeProps) {
  const [selectedOption, setSelectedOption] = useState<
    DateTimeAggregationOption | "Select date"
  >("Select date");

  function isValidOption(value: unknown): value is DateTimeAggregationOption {
    return (
      typeof value === "string" &&
      dateTimeAggregationOptions.includes(value as DateTimeAggregationOption)
    );
  }

  const closestInterval = dateRange
    ? findClosestInterval(dateRange)
    : undefined;

  closestInterval ? setAgg(closestInterval) : null;

  const onDropDownSelection = (value: string) => {
    if (isValidOption(value)) {
      const setting = dateTimeAggregationSettings[value];
      const fromDate = addMinutes(new Date(), -1 * setting.minutes);

      setDateRange({ from: fromDate, to: new Date() });
      setSelectedOption(value);
    } else {
      setSelectedOption("Select date");
    }
  };

  const onCalendarSelection = (range?: DateRange) => {
    setDateRange(range);
    setSelectedOption("Select date");
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
              "w-[350px] justify-start text-left font-normal",
              !dateRange && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateRange?.from ? (
              dateRange.to ? (
                <>
                  {format(dateRange.from, "LLL dd, y : hh:mm")} -{" "}
                  {format(dateRange.to, "LLL dd, y : hh:mm")}
                </>
              ) : (
                format(dateRange.from, "LLL dd, y")
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
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onSelect={onCalendarSelection}
            numberOfMonths={isSmallScreen ? 1 : 2} // TODO: make this configurable to screen size
          />
        </PopoverContent>
      </Popover>
      <Select value={selectedOption} onValueChange={onDropDownSelection}>
        <SelectTrigger className="w-40 hover:bg-accent hover:text-accent-foreground focus:ring-0 focus:ring-offset-0">
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent position="popper" defaultValue={60}>
          <SelectItem key={"Select date"} value={"Select date"}>
            {"Select date"}
          </SelectItem>
          {dateTimeAggregationOptions.toReversed().map((item) => (
            <SelectItem key={item} value={`${item}`}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
