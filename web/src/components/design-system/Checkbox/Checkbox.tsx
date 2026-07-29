"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { cva, type VariantProps } from "class-variance-authority";
import { Check } from "lucide-react";

import { cn } from "@/src/utils/tailwind";

const checkboxVariants = cva(
  "border-control-border ring-offset-background focus-visible:ring-ring data-[state=checked]:bg-control-fill data-[state=checked]:border-control-fill data-[state=checked]:text-primary-foreground peer shrink-0 rounded-sm border focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        default: "h-4 w-4 [&_svg]:h-4 [&_svg]:w-4",
        sm: "h-3.5 w-3.5 [&_svg]:h-3 [&_svg]:w-3",
      },
      variant: {
        default: "",
        muted: "opacity-60",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  },
);

type CheckboxProps = Pick<
  Omit<
    React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
    "className"
  >,
  "aria-label" | "checked" | "disabled" | "id" | "onCheckedChange" | "onClick"
> &
  VariantProps<typeof checkboxVariants>;

const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ size, variant, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(checkboxVariants({ size, variant }))}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <Check />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
