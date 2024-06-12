"use client";

import React, { useRef } from "react";
import {
  type AriaTimeFieldProps,
  useLocale,
  useTimeField,
  useDateSegment,
  type TimeValue,
} from "react-aria";
import {
  type DateFieldState,
  type TimeFieldStateOptions,
  useTimeFieldState,
} from "react-stately";
import { type DateSegment } from "@react-stately/datepicker";
import { cn } from "@/src/utils/tailwind";
import { Clock, Moon, Sun } from "lucide-react";
import { getLocalTimeZone } from "@internationalized/date";

interface DateSegmentProps {
  segment: DateSegment;
  state: DateFieldState;
}

function DateSegment({ segment, state }: DateSegmentProps) {
  const ref = useRef(null);
  const { segmentProps } = useDateSegment(segment, state, ref);

  return (
    <div
      {...segmentProps}
      ref={ref}
      className={cn(
        "focus:rounded-[2px] focus:bg-accent focus:text-accent-foreground focus:outline-none",
        segment.type !== "literal" && "px-[1px]",
        segment.isPlaceholder && "text-muted-foreground",
      )}
    >
      {segment.text}
    </div>
  );
}

function TimeField(props: AriaTimeFieldProps<TimeValue>) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { locale } = useLocale();
  const state = useTimeFieldState({
    ...props,
    granularity: "second",
    locale,
  });
  const { fieldProps } = useTimeField(
    { ...props, "aria-label": "time-field" },
    state,
    ref,
  );
  return (
    <div
      {...fieldProps}
      ref={ref}
      className={cn(
        "inline-flex h-10 w-full flex-1 items-center rounded-b-md border-t-2 bg-transparent px-3 py-2 text-sm ring-offset-background",
        props.isDisabled && "cursor-not-allowed opacity-50",
      )}
    >
      {isMidnightOrNoon(state.segments) ? (
        isAM(state.segments) ? (
          <Moon className="mr-2 h-4 w-4" />
        ) : (
          <Sun className="mr-2 h-4 w-4" />
        )
      ) : (
        <Clock className="mr-2 h-4 w-4" />
      )}
      {state.segments.map((segment, i) => {
        return <DateSegment key={i} segment={segment} state={state} />;
      })}

      <div className="pl-1">{getLocalTimeZone()}</div>
    </div>
  );
}

const TimePicker = React.forwardRef<
  HTMLDivElement,
  Omit<TimeFieldStateOptions<TimeValue>, "locale">
>((props) => {
  return <TimeField {...props} />;
});

TimePicker.displayName = "TimePicker";

export { TimePicker };

export const isMidnightOrNoon = (segments: DateSegment[]): boolean => {
  let hasHour = false;
  let hasMinute = false;
  let hasSecond = false;

  for (const segment of segments) {
    if (
      segment.type === "hour" &&
      (segment.value === 0 || segment.value === 12)
    ) {
      hasHour = true;
    } else if (segment.type === "minute" && segment.value === 0) {
      hasMinute = true;
    } else if (segment.type === "second" && segment.value === 0) {
      hasSecond = true;
    }

    if (hasHour && hasMinute && hasSecond) {
      return true;
    }
  }
  return false;
};

export const isAM = (segments: DateSegment[]): boolean => {
  return segments.some(
    (segment) => segment.type === "dayPeriod" && segment.text === "AM",
  );
};
