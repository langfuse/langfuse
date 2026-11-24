import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { ListFilter } from "@langfuse/icons";
import { cn } from "@/src/utils/tailwind";

/**
 * The score header's filter affordance. Spreads and forwards so a
 * `<Trigger asChild>` at the call site can hand it Radix's open state and
 * handlers, and takes its look from an explicit variant rather than a style
 * prop.
 */
export const ScoreColumnFilterMenuTrigger = forwardRef<
  HTMLButtonElement,
  Omit<
    ComponentPropsWithoutRef<"button">,
    "className" | "style" | "children" | "aria-label"
  > & {
    /** A filter is set on this score, so the control stops hiding itself. */
    isActive: boolean;
  }
>(({ isActive, ...triggerProps }, ref) => (
  <button
    ref={ref}
    aria-label="Filter items by this score"
    className={cn(
      "hover:bg-muted mt-0.5 shrink-0 rounded-sm p-0.5",
      isActive
        ? "text-primary-accent"
        : "text-muted-foreground opacity-0 group-hover:opacity-100",
    )}
    {...triggerProps}
  >
    <ListFilter size="sm" />
  </button>
));
ScoreColumnFilterMenuTrigger.displayName = "ScoreColumnFilterMenuTrigger";
