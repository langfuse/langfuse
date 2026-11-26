"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/src/utils/tailwind";

type ProgressSegment = {
  start: number;
  end: number;
  tone: "fill" | "muted" | "idle";
};

type ProgressProps = Required<
  Pick<React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>, "value">
> & {
  size?: "md" | "sm";
  /** Left side of the row above the track. Truncates before the value. */
  label?: string;
  labelTitle?: string;
  /** Muted value on the right of that row. */
  valueText?: string;
  /**
   * Marks along the track, in percent of the track width. Replaces the
   * single indicator so a span can sit in the middle of the range.
   */
  segments?: readonly ProgressSegment[];
};

const segmentClassName = {
  fill: "bg-primary",
  muted: "bg-primary/40",
  idle: "bg-background bg-[repeating-linear-gradient(315deg,hsl(var(--foreground)/0.22)_0_1px,transparent_1px_4px)]",
} as const;

const Progress = React.forwardRef<
  React.ComponentRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ value, size = "md", label, labelTitle, valueText, segments }, ref) => (
  <div className="min-w-0 overflow-hidden">
    {label || valueText ? (
      <div className="mb-0.5 flex items-baseline justify-between gap-2 text-xs">
        {label ? (
          <span className="min-w-0 truncate" title={labelTitle ?? label}>
            {label}
          </span>
        ) : (
          <span />
        )}
        {valueText ? (
          <span className="text-muted-foreground shrink-0 tabular-nums">
            {valueText}
          </span>
        ) : null}
      </div>
    ) : null}
    <ProgressPrimitive.Root
      ref={ref}
      value={value}
      className={cn(
        "bg-primary/20 relative w-full overflow-hidden rounded-full",
        size === "sm" ? "h-1.5" : "h-2",
      )}
    >
      {segments ? (
        segments.map((segment, index) => (
          <span
            key={index}
            className={cn("absolute inset-y-0", segmentClassName[segment.tone])}
            style={{
              left: `${clampPercent(segment.start)}%`,
              width: `${segmentWidth(segment.start, segment.end)}%`,
            }}
          />
        ))
      ) : (
        <ProgressPrimitive.Indicator
          className="bg-primary h-full w-full flex-1 transition-all"
          style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
        />
      )}
    </ProgressPrimitive.Root>
  </div>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function segmentWidth(start: number, end: number) {
  const left = clampPercent(start);
  const right = clampPercent(end);
  return Math.max(0, right - left);
}

export { Progress };
