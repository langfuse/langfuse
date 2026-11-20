"use client";

import { type ReactElement } from "react";

import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { cn } from "@/src/utils/tailwind";

// A disabled button is not a hover target. The trigger is this wrapper, and
// the layer above the button receives the pointer so the button can stay as it is.
export function DisabledActionTooltip({
  label,
  fill = false,
  children,
}: {
  label: string;
  /** Match a dialog footer action that stretches on narrow screens. */
  fill?: boolean;
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
              "relative inline-flex",
              fill && "w-full sm:w-auto",
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
