"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { type ReactElement } from "react";

import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { cn } from "@/src/utils/tailwind";

const disabledActionTooltipVariants = cva("relative inline-flex", {
  variants: {
    width: {
      /** Match a dialog footer action that stretches on narrow screens. */
      fill: "w-full sm:w-auto",
    },
  },
});

// A disabled button is not a hover target. The trigger is this wrapper, and
// the layer above the button receives the pointer so the button can stay as it is.
export function DisabledActionTooltip({
  label,
  width,
  children,
}: {
  label: string;
  width?: VariantProps<typeof disabledActionTooltipVariants>["width"];
  children: ReactElement;
}) {
  return (
    <Tooltip label={label}>
      {({ getTriggerProps }) => {
        const triggerProps = getTriggerProps();
        return (
          <span
            {...triggerProps}
            className={cn(
              typeof triggerProps.className === "string"
                ? triggerProps.className
                : undefined,
              disabledActionTooltipVariants({ width }),
            )}
          >
            {children}
            <span
              aria-hidden="true"
              className="absolute inset-0 cursor-not-allowed"
            />
          </span>
        );
      }}
    </Tooltip>
  );
}
