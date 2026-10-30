import type * as React from "react";
import { cva } from "class-variance-authority";

import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { Button } from "@/src/components/ui/button";

/** pickerVariants sizes the picker: shrinking freely in compact rows or keeping a readable minimum. */
const pickerVariants = cva("flex w-full items-center justify-between gap-2", {
  variants: {
    minWidth: { none: "min-w-0", default: "min-w-32" },
  },
});

/** CompactPickerButton is the outlined picker trigger of compact filter rows, for use as a popover or select trigger. */
export const CompactPickerButton = ({
  title,
  minWidth = "none",
  children,
  ...props
}: Omit<
  React.ComponentProps<typeof Button>,
  "variant" | "className" | "children"
> & {
  title?: string;
  minWidth?: "none" | "default";
  children: React.ReactNode;
}) => (
  <Button
    variant="outline"
    role="combobox"
    type="button"
    className={pickerVariants({ minWidth })}
    {...props}
  >
    <span className="min-w-0 truncate" title={title}>
      {children}
    </span>
    <DropdownIndicator />
  </Button>
);
