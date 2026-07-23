"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

type ProgressProps = Required<
  Pick<React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>, "value">
>;

const Progress = React.forwardRef<
  React.ComponentRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ value }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className="bg-primary/20 relative h-2 w-full overflow-hidden rounded-full"
  >
    <ProgressPrimitive.Indicator
      className="bg-primary h-full w-full flex-1 transition-all"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
