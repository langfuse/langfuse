import { useState, type ReactNode } from "react";
import { cva } from "class-variance-authority";
import { Check, ChevronDown } from "@langfuse/icons";

import { cn } from "@/src/utils/tailwind";

const markerVariants = cva(
  "flex shrink-0 items-center justify-center rounded-full",
  {
    variants: {
      variant: {
        filled: "bg-primary text-primary-foreground",
        outline:
          "bg-background text-foreground border-border-contrast border font-bold",
      },
      size: {
        default: "size-7 text-sm",
        sm: "size-5 text-xs",
      },
      status: {
        current: null,
        complete: null,
        upcoming: "bg-background text-muted-foreground border-border border",
      },
    },
  },
);

const headerVariants = cva("flex items-center gap-1.5 text-left", {
  variants: {
    size: {
      default: "min-h-7",
      sm: "min-h-5",
    },
  },
});

const titleVariants = cva("font-bold", {
  variants: {
    size: {
      default: "text-lg",
      sm: "text-sm",
    },
    status: {
      current: null,
      complete: null,
      upcoming: "text-muted-foreground",
    },
  },
});

const descriptionVariants = cva("text-muted-foreground", {
  variants: {
    size: {
      default: "text-sm",
      sm: "text-xs",
    },
  },
});

type StepperProps = {
  number: number;
  title: string;
  description?: ReactNode;
  variant?: "filled" | "outline";
  size?: "default" | "sm";
  /** Complete swaps the number for a check; upcoming mutes the step. */
  status?: "current" | "complete" | "upcoming";
  compactBottomSpacing?: boolean;
  children?: ReactNode;
} & (
  | {
      /** Toggles the body from the step header; on by default. */
      isCollapsible?: true;
      defaultOpen?: boolean;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }
  | {
      isCollapsible: false;
      defaultOpen?: never;
      open?: never;
      onOpenChange?: never;
    }
);

/**
 * Datadog-style vertical stepper section: a numbered circle with a connector
 * line down to the next step. Collapsible steps toggle their body from the
 * header and support controlled expansion for progressive flows. Render steps
 * as siblings — the last one drops its connector and trailing space via
 * `:last-child`, so adding or reordering steps needs no bookkeeping.
 */
export function Stepper({
  number,
  title,
  description,
  variant = "filled",
  size = "default",
  status = "current",
  compactBottomSpacing = false,
  isCollapsible = true,
  defaultOpen = true,
  open,
  onOpenChange,
  children,
}: StepperProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const expanded = !isCollapsible || (open ?? internalOpen);
  const hasBody = Boolean(description) || Boolean(children);

  const toggle = () => {
    const nextOpen = !expanded;
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <div className="group/step flex gap-1.5">
      <div className="flex flex-col items-center">
        <div className={cn(markerVariants({ variant, size, status }))}>
          {status === "complete" ? (
            <Check size="sm" aria-label="Completed" />
          ) : (
            number
          )}
        </div>
        <div className="bg-border my-1 w-px flex-1 group-last/step:hidden" />
      </div>

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col group-last/step:pb-0",
          compactBottomSpacing ? "pb-3" : "pb-8",
        )}
      >
        {isCollapsible ? (
          <button
            type="button"
            className={headerVariants({ size })}
            aria-label={`Step ${number}: ${title}`}
            aria-expanded={expanded}
            onClick={toggle}
          >
            <ChevronDown
              size="base"
              color="tertiary"
              __rawClassName={cn(
                "translate-y-px transition-transform",
                !expanded && "-rotate-90",
              )}
            />
            <span className={titleVariants({ size, status })}>{title}</span>
          </button>
        ) : (
          <div className={headerVariants({ size })}>
            <span className={titleVariants({ size, status })}>{title}</span>
          </div>
        )}
        {expanded && hasBody ? (
          <div
            className={cn(
              "flex flex-col",
              isCollapsible ? "gap-4 pl-5" : "gap-2",
            )}
          >
            {description ? (
              <p className={descriptionVariants({ size })}>{description}</p>
            ) : null}
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
