"use client";

import { cloneElement, type ReactElement } from "react";

import { Button } from "@/src/components/design-system/Button/Button";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { cn } from "@/src/utils/tailwind";

// Disabled buttons swallow pointer events, so the tooltip listens on this
// wrapper and the button lets those events through.
type PointerChild = ReactElement<{
  className?: string;
  ignorePointer?: boolean;
}>;

function releasePointerEvents(child: ReactElement) {
  const element = child as PointerChild;
  if (element.type === Button) {
    return cloneElement(element, { ignorePointer: true });
  }

  return cloneElement(element, {
    className: cn(element.props.className, "pointer-events-none"),
  });
}

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
              "inline-flex cursor-not-allowed",
              fill && "w-full sm:w-auto",
            )}
          >
            {releasePointerEvents(children)}
          </span>
        );
      }}
    </Tooltip>
  );
}
