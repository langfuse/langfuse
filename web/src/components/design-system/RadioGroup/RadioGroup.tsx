"use client";

import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";

type RadioGroupProps = Pick<
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>,
  "children" | "defaultValue" | "onValueChange" | "value"
>;

const RadioGroupRoot = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Root>,
  RadioGroupProps
>((props, ref) => {
  return (
    <RadioGroupPrimitive.Root className="grid gap-2" {...props} ref={ref} />
  );
});
RadioGroupRoot.displayName = RadioGroupPrimitive.Root.displayName;

type RadioGroupItemProps = Pick<
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>,
  "aria-controls" | "disabled" | "id" | "value"
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
