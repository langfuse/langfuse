"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cva, type VariantProps } from "class-variance-authority";

const trackVariants = cva("relative h-2 w-full overflow-hidden rounded-full", {
  variants: {
    tone: {
      default: "bg-primary/20",
      warning: "bg-dark-yellow/20",
      critical: "bg-dark-red/20",
    },
  },
  defaultVariants: { tone: "default" },
});

const indicatorVariants = cva("h-full w-full flex-1 transition-all", {
  variants: {
    tone: {
      default: "bg-primary",
      warning: "bg-dark-yellow",
      critical: "bg-dark-red",
    },
  },
  defaultVariants: { tone: "default" },
});

type ProgressProps = Required<
  Pick<React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>, "value">
> &
  VariantProps<typeof trackVariants> & {
    /** Accessible name, e.g. "Usage of the plan limit". */
    label?: string;
  };

const Progress = React.forwardRef<
  React.ComponentRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ value, tone, label }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    value={value}
    aria-label={label}
    className={trackVariants({ tone })}
  >
    <ProgressPrimitive.Indicator
      className={indicatorVariants({ tone })}
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
