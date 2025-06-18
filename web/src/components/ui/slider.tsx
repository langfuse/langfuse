"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Input } from "./input";

import { cn } from "@/src/utils/tailwind";

export interface SliderProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  showInput?: boolean;
  displayAsPercentage?: boolean;
  decimalPlaces?: number;
  onValueChange?: (value: number[]) => void;
}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(
  (
    { className, showInput, displayAsPercentage, decimalPlaces = 2, ...props },
    ref,
  ) => {
    const [inputValue, setInputValue] = React.useState<string>("");

    // Calculate display value based on the first slider value
    React.useEffect(() => {
      if (props.value && props.value.length > 0) {
        const value = props.value[0];
        if (value === undefined || value === null) return;
        if (displayAsPercentage) {
          setInputValue((value * 100).toFixed(decimalPlaces));
        } else {
          setInputValue(value.toString());
        }
      }
    }, [props.value, displayAsPercentage, decimalPlaces]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInputValue(newValue);
    };

    const handleInputBlur = () => {
      let newVal = parseFloat(inputValue);

      if (isNaN(newVal)) {
        // Reset to current value if invalid input
        if (props.value && props.value.length > 0) {
          const value = props.value[0];
          if (value === undefined || value === null) return;
          if (displayAsPercentage) {
            setInputValue((value * 100).toFixed(decimalPlaces));
          } else {
            setInputValue(value.toString());
          }
        }
        return;
      }

      // Convert percentage input back to decimal for the slider
      if (displayAsPercentage) {
        newVal = newVal / 100;
      }

      // Clamp value to min/max
      const min = props.min ?? 0;
      const max = props.max ?? 100;
      newVal = Math.max(min, Math.min(max, newVal));

      // Update slider value
      if (props.onValueChange) {
        props.onValueChange([newVal]);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleInputBlur();
      }
    };

    return (
      <div className={cn("flex items-center gap-4", className)}>
        <SliderPrimitive.Root
          ref={ref}
          className="relative flex w-full touch-none select-none items-center"
          {...props}
        >
          <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
            <SliderPrimitive.Range
              className={cn(
                "absolute h-full",
                props.disabled ? "bg-input" : "bg-primary",
              )}
            />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            className={cn(
              "block h-5 w-5 rounded-full border-2 bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
              props.disabled ? "border-secondary" : "border-primary",
            )}
          />
        </SliderPrimitive.Root>

        {showInput && (
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onKeyDown={handleKeyDown}
              className="w-20 text-right"
              disabled={props.disabled}
              min={
                displayAsPercentage
                  ? props.min
                    ? props.min * 100
                    : 0
                  : props.min
              }
              max={
                displayAsPercentage
                  ? props.max
                    ? props.max * 100
                    : 100
                  : props.max
              }
              aria-label="Slider value"
            />
            {displayAsPercentage && (
              <span className="text-sm text-muted-foreground">%</span>
            )}
          </div>
        )}
      </div>
    );
  },
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
