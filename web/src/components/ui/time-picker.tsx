"use client";

import * as React from "react";
import { TimePickerInput } from "./time-picker-input";
import { TimePeriodSelect } from "./time-period-select";
import { type Period } from "./time-picker-utils";
import { Clock, Moon, Sun } from "lucide-react";

interface TimePickerProps {
  date: Date | undefined;
  setDate: (date: Date | undefined) => void;
}

export function TimePicker({ date, setDate }: TimePickerProps) {
  const [period, setPeriod] = React.useState<Period>("PM");

  const minuteRef = React.useRef<HTMLInputElement>(null);
  const hourRef = React.useRef<HTMLInputElement>(null);
  const secondRef = React.useRef<HTMLInputElement>(null);
  const periodRef = React.useRef<HTMLButtonElement>(null);

  const getIcon = () => {
    if (date) {
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const seconds = date.getSeconds();
      if (hours === 12 && minutes === 0 && seconds === 0) {
        return <Moon className="size-5" />;
      }
      if (hours === 0 && minutes === 0 && seconds === 0) {
        return <Sun className="size-5" />;
      }
      return <Clock className="size-5" />;
    }
  };

  return (
    <div className="flex w-full flex-1 items-center gap-1 rounded-b-md border-t-2 bg-transparent px-3 py-2 text-sm ring-offset-background">
      <div className="ml-2 mr-2 grid gap-1 text-center">{getIcon()}</div>
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
      <div className="grid gap-1 text-center">
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
    </div>
  );
}
