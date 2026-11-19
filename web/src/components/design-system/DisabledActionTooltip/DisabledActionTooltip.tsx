"use client";

import { type ReactElement } from "react";

import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { cn } from "@/src/utils/tailwind";

// A disabled button is not a pointer target, so the tooltip trigger is a
// transparent layer above it rather than a style applied to the button.
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
      {({ getTriggerProps }) => (
        <span
          className={cn("relative inline-flex", fill && "w-full sm:w-auto")}
        >
          {children}
          <span
            {...getTriggerProps()}
            className="absolute inset-0 cursor-not-allowed"
          />
        </span>
      )}
    </Tooltip>
  );
}
