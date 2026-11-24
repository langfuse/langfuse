"use client";

import { cva } from "class-variance-authority";
import { type ReactElement } from "react";

import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { cn } from "@/src/utils/tailwind";

const disabledActionTooltipVariants = cva("relative inline-flex", {
  variants: {
    width: {
      fill: "w-full sm:w-auto",
      full: "flex w-full flex-col",
    },
  },
});

const widthOf = ({
  isFullWidth,
  shouldFill,
}: {
  isFullWidth: boolean;
  shouldFill: boolean;
}) => {
  if (isFullWidth) return "full";
  return shouldFill ? "fill" : undefined;
};

// A disabled control is not a hover target. The trigger is this wrapper, and
// the layer above the control receives the pointer so the control can stay as it is.
export function DisabledActionTooltip({
  label,
  shouldFill = false,
  isFullWidth = false,
  children,
}: {
  label: string;
  /** Match a dialog footer action that stretches on narrow screens. */
  shouldFill?: boolean;
  /** Span the parent, for a disabled field rather than a button. */
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
                width: widthOf({ isFullWidth, shouldFill }),
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
