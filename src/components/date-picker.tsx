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

export type DateTimeAggregationOption = {
  dateRange?: DateRange;
  setDateRange: (date?: DateRange) => void;
  className?: string;
};

export function DatePickerWithRange({
  className,
  dateRange,
  setDateRange,
}: DateTimeAggregationOption) {
  const availableSelections = [
    { key: "0", interval: null, label: "Select date" },
    { key: "1", interval: 30, label: "Last 30 minutes" },
    { key: "2", interval: 60, label: "Last 60 minutes" },
    { key: "3", interval: 24 * 60, label: "Last 24 hours" },
    { key: "4", interval: 7 * 24 * 60, label: "7 Days" },
    { key: "5", interval: 30 * 24 * 60, label: "Last Month" },
    { key: "6", interval: 3 * 30 * 24 * 60, label: "Last 3 Months" },
    { key: "7", interval: 365 * 24 * 60 * 60, label: "Last Year" },
  ];

  const [selectedOption, setSelectedOption] = useState(availableSelections[0]);

  const onDropDownSelection = (value: string) => {
    const interval = availableSelections.find((s) => s.key === value)?.interval;
    if (interval) {
      const fromDate = addMinutes(new Date(), -1 * interval);

      setDateRange({ from: fromDate, to: new Date() });
    }

    setSelectedOption(
      availableSelections.find((item) => item.interval === parseInt(value)),
    );
  };

  const onCalendarSelection = (range?: DateRange) => {
    setDateRange(range);
    setSelectedOption(availableSelections[0]);
  };

  console.log("dateRange", dateRange);

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
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
      <Select value={selectedOption?.key} onValueChange={onDropDownSelection}>
        <SelectTrigger className="w-40 hover:bg-accent hover:text-accent-foreground focus:ring-0 focus:ring-offset-0">
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent position="popper" defaultValue={60}>
          {availableSelections.map((item) => (
            <SelectItem key={item.key} value={`${item.key}`}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
