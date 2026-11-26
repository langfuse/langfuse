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
  muted: "bg-foreground/25",
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
        "relative w-full",
        size === "sm"
          ? "h-2"
          : "bg-primary/20 h-2 overflow-hidden rounded-full",
      )}
    >
      {segments ? (
        <ProgressSegments segments={segments} size={size} />
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

function ProgressSegments({
  segments,
  size,
}: {
  segments: readonly ProgressSegment[];
  size: "md" | "sm";
}) {
  const raised = size === "sm";
  return (
    <div className={cn("relative w-full", raised ? "h-2" : "h-full")}>
      <div
        className={cn(
          "bg-muted absolute inset-x-0 overflow-hidden rounded-full",
          raised ? "top-1/2 h-1 -translate-y-1/2" : "inset-y-0",
        )}
      >
        {segments.map((segment, index) =>
          segment.tone === "fill" ? null : (
            <span
              key={index}
              className={cn(
                "absolute inset-y-0",
                segmentClassName[segment.tone],
              )}
              style={percentBox(segment.start, segment.end)}
            />
          ),
        )}
      </div>
      {segments.map((segment, index) =>
        segment.tone === "fill" ? (
          <span
            key={index}
            className={cn(
              "bg-primary absolute rounded-full",
              raised
                ? "top-1/2 h-2 min-w-1 -translate-y-1/2"
                : "inset-y-0 min-w-1",
            )}
            style={fillBox(segment.start, segment.end)}
          />
        ) : null,
      )}
    </div>
  );
}

function percentBox(start: number, end: number) {
  return {
    left: `${clampPercent(start)}%`,
    width: `${segmentWidth(start, end)}%`,
  };
}

function fillBox(start: number, end: number) {
  const left = clampPercent(start);
  const width = segmentWidth(start, end);
  return {
    left: `clamp(0px, ${left}%, calc(100% - 4px))`,
    width: `max(4px, ${width}%)`,
  };
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function segmentWidth(start: number, end: number) {
  const left = clampPercent(start);
  const right = clampPercent(end);
  return Math.max(0, right - left);
}

export { Progress };
