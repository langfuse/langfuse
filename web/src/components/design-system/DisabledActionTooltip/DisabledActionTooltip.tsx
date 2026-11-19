"use client";

import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { cn } from "@/src/utils/tailwind";

// Disabled buttons fire no pointer events, so the tooltip listens on a wrapper.
export function DisabledActionTooltip({
  label,
  fill = false,
  children,
}: {
  label: string;
  /** Stretch the wrapped button the way a dialog footer action does. */
  fill?: boolean;
  children: React.ReactElement;
}) {
  return (
    <Tooltip label={label}>
      {({ getTriggerProps }) => (
        <span
          {...getTriggerProps()}
          className={cn(
            "inline-flex cursor-not-allowed [&>button]:pointer-events-none",
            fill && "w-full sm:w-auto [&>button]:w-full",
          )}
        >
          {children}
        </span>
      )}
    </Tooltip>
  );
}
