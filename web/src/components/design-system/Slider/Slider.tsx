"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/src/utils/tailwind";

type SliderMark = { value: number; label: string };

type SliderProps = {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Labels under the track at these values; the end labels align to the track's edges. */
  marks?: readonly SliderMark[];
  "aria-label": string;
};

/** A single-value slider; the track and fill use the same tokens as Switch. */
export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  marks,
  "aria-label": ariaLabel,
}: SliderProps) {
  const position = (mark: number) => ((mark - min) / (max - min)) * 100;
  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5">
      <SliderPrimitive.Root
        value={[value]}
        onValueChange={(next) => onValueChange(next[0] ?? value)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="relative flex h-4 w-full touch-none items-center select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
      >
        <SliderPrimitive.Track className="bg-control-track relative h-2 w-full grow overflow-hidden rounded-full">
          <SliderPrimitive.Range className="bg-control-fill absolute h-full rounded-full" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label={ariaLabel}
          className="bg-background focus-visible:ring-ring focus-visible:ring-offset-background flex size-4 items-center justify-center rounded-full shadow-md ring-1 ring-black/10 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
        >
          <span aria-hidden className="bg-control-fill size-1.5 rounded-full" />
        </SliderPrimitive.Thumb>
      </SliderPrimitive.Root>
      {marks?.length ? (
        <div aria-hidden className="relative h-4">
          {marks.map((mark, index) => (
            <span
              key={mark.value}
              className={cn(
                "text-muted-foreground absolute top-0 font-mono text-xs",
                index === 0 && "left-0",
                index === marks.length - 1 && "right-0",
                index > 0 && index < marks.length - 1 && "-translate-x-1/2",
              )}
              style={
                index > 0 && index < marks.length - 1
                  ? { left: `${position(mark.value)}%` }
                  : undefined
              }
            >
              {mark.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
