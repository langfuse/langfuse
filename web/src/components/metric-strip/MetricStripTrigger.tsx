import { forwardRef, useRef } from "react";
import type * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

/**
 * The bare dropdown triggers in a strip's header row (see `MetricStripBand`):
 * a bold metric name and, next to it, the aggregation it is drawn with. No
 * button chrome — the band is thin, so the label IS the control.
 */

export type MetricStripTriggerVariant = "metric" | "aggregation";

/** Shared so a strip whose menu is a different primitive still matches. */
export const METRIC_STRIP_TRIGGER_CLASS =
  "flex items-center gap-0.5 text-[13px] leading-none";

export const metricStripTriggerClasses: Record<
  MetricStripTriggerVariant,
  string
> = {
  metric: "text-foreground hover:text-muted-foreground font-bold",
  aggregation:
    "text-muted-foreground hover:text-foreground underline-offset-2 hover:underline",
};

export const MetricStripTrigger = forwardRef<
  HTMLButtonElement,
  {
    ariaLabel: string;
    label: string;
    variant: MetricStripTriggerVariant;
  } & Omit<React.ComponentPropsWithoutRef<"button">, "aria-label" | "className">
>(({ ariaLabel, label, variant, ...buttonProps }, ref) => (
  <button
    {...buttonProps}
    ref={ref}
    type="button"
    aria-label={ariaLabel}
    className={cn(
      METRIC_STRIP_TRIGGER_CLASS,
      metricStripTriggerClasses[variant],
    )}
  >
    {label}
    <ChevronDown className="h-2.5 w-2.5" />
  </button>
));
MetricStripTrigger.displayName = "MetricStripTrigger";

/**
 * Prevent Radix's close-refocus ONLY after a pointer-driven selection — the
 * programmatic refocus renders as a keyboard-style outline on the trigger.
 * Escape / click-outside / keyboard selection keep the default focus return
 * so keyboard users aren't dropped onto <body> (mirrors ChatMessages,
 * LFE-6864).
 */
export const usePointerSelectionFocusGuard = () => {
  const selectedViaPointerRef = useRef(false);
  return {
    markPointerSelection: (event: { detail: number }) => {
      // Keyboard-synthesized clicks carry detail 0; real pointer clicks ≥ 1.
      if (event.detail > 0) selectedViaPointerRef.current = true;
    },
    onCloseAutoFocus: (event: Event) => {
      if (selectedViaPointerRef.current) {
        event.preventDefault();
        selectedViaPointerRef.current = false;
      }
    },
  };
};
