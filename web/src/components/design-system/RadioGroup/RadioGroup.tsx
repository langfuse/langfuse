"use client";

import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";

import { cn } from "@/src/utils/tailwind";

type RadioGroupProps = Pick<
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>,
  "children" | "defaultValue" | "onValueChange" | "value"
> & {
  /** "none" for items that bring their own rows, like a divided list. */
  spacing?: "default" | "none";
};

const RadioGroupRoot = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Root>,
  RadioGroupProps
>(({ spacing = "default", ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Root
      className={spacing === "none" ? "grid" : "grid gap-2"}
      {...props}
      ref={ref}
    />
  );
});
RadioGroupRoot.displayName = RadioGroupPrimitive.Root.displayName;

type RadioGroupItemProps = Pick<
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>,
  "aria-controls" | "disabled" | "id" | "value"
> & {
  /** Matches the Checkbox sizes. */
  size?: "default" | "sm";
};

const RadioGroupItem = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Item>,
  RadioGroupItemProps
>(({ size = "default", ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        "border-control-border focus-visible:ring-ring data-[state=checked]:border-control-fill aspect-square rounded-full border shadow-sm focus:outline-hidden focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4",
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <div
          className={cn(
            "bg-control-fill rounded-full",
            size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2",
          )}
        />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
});
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

const RadioGroup = Object.assign(RadioGroupRoot, {
  Item: RadioGroupItem,
});

export { RadioGroup };
