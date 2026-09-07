"use client";

import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cva } from "class-variance-authority";
import { cn } from "@/src/utils/tailwind";

const radioGroupVariants = cva("grid gap-2", {
  variants: {
    layout: {
      stack: "",
      // RadioGroup.Root rendered as a layout-neutral wrapper (used when the
      // radio items live inside a larger block, e.g. a data-table column)
      inline: "contents",
    },
  },
  defaultVariants: { layout: "stack" },
});

type RadioGroupProps = Pick<
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>,
  "aria-label" | "children" | "defaultValue" | "onValueChange" | "value"
> & { layout?: "stack" | "inline" };

const RadioGroupRoot = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Root>,
  RadioGroupProps
>(({ layout, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Root
      className={cn(radioGroupVariants({ layout }))}
      {...props}
      ref={ref}
    />
  );
});
RadioGroupRoot.displayName = RadioGroupPrimitive.Root.displayName;

type RadioGroupItemProps = Pick<
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>,
  "aria-controls" | "aria-label" | "disabled" | "id" | "value"
>;

const RadioGroupItem = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Item>,
  RadioGroupItemProps
>((props, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className="border-control-border focus-visible:ring-ring data-[state=checked]:border-control-fill aspect-square h-4 w-4 rounded-full border shadow-sm focus:outline-hidden focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <div className="bg-control-fill h-2 w-2 rounded-full" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
});
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

const RadioGroup = Object.assign(RadioGroupRoot, {
  Item: RadioGroupItem,
});

export { RadioGroup };
