"use client";

import { cva } from "class-variance-authority";
import { type ReactElement } from "react";

import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { cn } from "@/src/utils/tailwind";

const disabledActionTooltipVariants = cva("relative inline-flex", {
  variants: {
    width: {
      fill: "w-full sm:w-auto",
      full: "w-full",
    },
  },
});

// A disabled button is not a hover target. The trigger is this wrapper, and
// the layer above the button receives the pointer so the button can stay as it is.
export function DisabledActionTooltip({
  label,
  shouldFill = false,
  isFullWidth = false,
  children,
}: {
  label: string;
  /** Match a dialog footer action that stretches on narrow screens. */
  shouldFill?: boolean;
  /** Cover a whole disabled form section rather than one button. */
  isFullWidth?: boolean;
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
              disabledActionTooltipVariants({
                width: getWidth(shouldFill, isFullWidth),
              }),
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

function getWidth(shouldFill: boolean, isFullWidth: boolean) {
  if (isFullWidth) return "full";
  if (shouldFill) return "fill";
  return undefined;
}
