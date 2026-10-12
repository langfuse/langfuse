/* eslint-disable @repo/no-style-props */
"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/src/utils/tailwind";

// `block` is load-bearing. A `<label>` is inline by default, and a vertical
// margin on an inline box is dropped — so the gap a stacked field declares
// between its label and its control (`space-y-*`, which Tailwind applies as a
// bottom margin on the label) does not render at all. Horizontal layouts are
// unaffected: a flex or grid item is blockified either way, and a caller that
// passes its own `flex`/`grid` wins the `cn()` merge.
const labelVariants = cva(
  "block text-sm font-bold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
);

const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
