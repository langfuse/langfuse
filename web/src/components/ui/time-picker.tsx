"use client";

import * as React from "react";
import { TimePickerInput } from "./time-picker-input";
import { TimePeriodSelect } from "./time-period-select";
import { type Period } from "./time-picker-utils";
import { getTimezoneDetails, getShortLocalTimezone } from "@/src/utils/dates";
import { TimeIcon } from "@/src/components/ui/time-icon";

interface TimePickerProps {
  date: Date | undefined;
  setDate: (date: Date | undefined) => void;
}

export function TimePicker({ date, setDate }: TimePickerProps) {
  const [period, setPeriod] = React.useState<Period>("AM");

  const minuteRef = React.useRef<HTMLInputElement>(null);
  const hourRef = React.useRef<HTMLInputElement>(null);
  const secondRef = React.useRef<HTMLInputElement>(null);
  const periodRef = React.useRef<HTMLButtonElement>(null);

  const shortTimezone = React.useMemo(() => getShortLocalTimezone(), []);
  const timezoneDetails = React.useMemo(() => getTimezoneDetails(), []);

  return (
    <div className="flex w-full flex-1 items-center gap-1 rounded-b-md border-t-2 bg-transparent px-3 py-2 text-sm ring-offset-background">
      <div className="mx-1 grid gap-1 text-center">
        <TimeIcon time={date ?? period} />
      </div>
      <div className="grid gap-1 text-center">
        <TimePickerInput
          picker="12hours"
          period={period}
          date={date}
          setDate={setDate}
          ref={hourRef}
          onRightFocus={() => minuteRef.current?.focus()}
        />
      </div>
      {":"}
      <div className="grid gap-1 text-center">
        <TimePickerInput
          picker="minutes"
          id="minutes"
          date={date}
          setDate={setDate}
          ref={minuteRef}
          onLeftFocus={() => hourRef.current?.focus()}
          onRightFocus={() => secondRef.current?.focus()}
        />
      </div>
      {":"}
      <div className="grid gap-1">
        <TimePickerInput
          picker="seconds"
          id="seconds"
          date={date}
          setDate={setDate}
          ref={secondRef}
          onLeftFocus={() => minuteRef.current?.focus()}
          onRightFocus={() => periodRef.current?.focus()}
        />
      </div>
      <div className="ml-0.5 grid gap-1 text-center">
        <TimePeriodSelect
          period={period}
          setPeriod={setPeriod}
          date={date}
          setDate={setDate}
          ref={periodRef}
          onLeftFocus={() => secondRef.current?.focus()}
        />
      </div>
      <div className="group relative ml-1">
        <span>{shortTimezone}</span>
        <div className="text-s absolute left-1/2 top-full mt-2 hidden -translate-x-1/2 transform whitespace-nowrap rounded bg-card px-2 py-1 text-card-foreground shadow-md ring-1 ring-border group-hover:block">
          {timezoneDetails}
        </div>
      </div>
    </div>
  );
}
