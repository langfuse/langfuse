import * as React from "react";
import { Button, type ButtonProps } from "@/src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/utils/tailwind";

export interface IconOnlyButtonProps extends Omit<
  ButtonProps,
  "children" | "title"
> {
  /** Icon glyph rendered inside the button. */
  icon: React.ReactNode;
  /**
   * Accessible name for the button, shown as the hover/focus tooltip. An
   * icon-only button has no visible text, so this is required. Also used as the
   * `aria-label` unless one is passed explicitly.
   */
  label: string;
  /**
   * When set, the button is disabled and the tooltip shows this reason instead
   * of the label (e.g. a missing-permission explanation).
   */
  disabledReason?: string;
}

/**
 * Compact, icon-only action button with a built-in tooltip. It always renders a
 * tooltip — the `label`, or `disabledReason` when disabled — because an icon
 * button carries no visible text. Native disabled buttons swallow pointer
 * events, so the tooltip trigger is the wrapping span and the button drops
 * pointer events while disabled, letting the hover reach the span.
 *
 * Drive any Dialog/Popover from `onClick` (controlled open) rather than wrapping
 * this in a Radix `*Trigger asChild`: the component's root is the tooltip, not
 * the button, so `asChild` cloning would not reach the underlying element.
 */
export const IconOnlyButton = React.forwardRef<
  HTMLButtonElement,
  IconOnlyButtonProps
>(function IconOnlyButton(
  {
    icon,
    label,
    disabledReason,
    variant = "ghost",
    size = "icon-xs",
    disabled,
    className,
    "aria-label": ariaLabel,
    ...props
  },
  ref,
) {
  const isDisabled = disabled || Boolean(disabledReason);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex", isDisabled && "cursor-not-allowed")}>
          <Button
            ref={ref}
            variant={variant}
            size={size}
            aria-label={ariaLabel ?? label}
            disabled={isDisabled}
            className={cn(className, isDisabled && "pointer-events-none")}
            {...props}
          >
            {icon}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{disabledReason ?? label}</TooltipContent>
    </Tooltip>
  );
});
