import { useState, type ReactNode } from "react";
import { cva } from "class-variance-authority";
import { Check, ChevronDown, Info } from "@langfuse/icons";

import {
  RichDescription as RichDescriptionContent,
  type RichDescription,
} from "@/src/components/design-system/internal/RichDescription/RichDescription";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { cn } from "@/src/utils/tailwind";

export type { RichDescription };

const markerVariants = cva(
  "flex shrink-0 items-center justify-center font-bold",
  {
    variants: {
      variant: {
        filled: "bg-primary text-primary-foreground",
        outline:
          "bg-background text-foreground border-border-contrast border font-bold",
      },
      size: {
        default: "size-7 rounded-lg text-sm",
        md: "size-6 rounded-lg text-xs",
        sm: "size-5 rounded-md text-xs",
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
      md: "min-h-6",
      sm: "min-h-5",
    },
  },
});

const titleVariants = cva("font-bold", {
  variants: {
    size: {
      default: "text-lg",
      md: "text-base",
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
      md: "text-sm",
      sm: "text-xs",
    },
  },
});

type StepperProps = {
  number: number;
  title: string;
  /** Shown in an info tooltip beside the title, outside the collapse control. */
  tooltipText?: string;
  description?: RichDescription;
  /** Keeps the description out of session replay when it contains customer data. */
  descriptionNoCapture?: boolean;
  /**
   * A control after the title; stays visible when collapsed and gets the rest
   * of the header row. The title then takes a field label's width, so the
   * control lines up with labelled rows.
   */
  // TODO: typed API
  // eslint-disable-next-line @repo/no-node-slot-props -- one caller places a tabs toggle in the header
  headerEnd?: ReactNode;
  variant?: "filled" | "outline";
  size?: "default" | "md" | "sm";
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
 * Datadog-style vertical stepper section: a numbered square with a dotted
 * connector down to the next step. Collapsible steps toggle their body from the
 * header and support controlled expansion for progressive flows. Render steps
 * as siblings — the last one drops its connector and trailing space via
 * `:last-child`, so adding or reordering steps needs no bookkeeping.
 */
export function Stepper({
  number,
  title,
  tooltipText,
  description,
  descriptionNoCapture = false,
  headerEnd,
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
  const titleClassName = cn(
    titleVariants({ size, status }),
    headerEnd ? "min-w-16 shrink-0 text-left" : null,
  );

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
        <div className="border-border-contrast my-1 w-0 flex-1 border-l border-dotted mask-y-from-[calc(100%-var(--spacing)*4)] group-last/step:hidden" />
      </div>

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col group-last/step:pb-0",
          compactBottomSpacing ? "pb-3" : "pb-8",
        )}
      >
        <div className={headerVariants({ size })}>
          {isCollapsible ? (
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1.5",
                headerEnd ? "shrink-0" : null,
              )}
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
              <span className={titleClassName}>{title}</span>
            </button>
          ) : (
            <span className={titleClassName}>{title}</span>
          )}
          {tooltipText ? (
            <Tooltip label={tooltipText}>
              {({ getTriggerProps }) => (
                <button
                  {...getTriggerProps()}
                  type="button"
                  aria-label={`About ${title}`}
                  className="inline-flex cursor-help items-center"
                >
                  <Info aria-hidden size="base" color="muted" />
                </button>
              )}
            </Tooltip>
          ) : null}
          {headerEnd ? (
            <div className="-my-1 ml-0.5 flex min-w-0 flex-1 items-center">
              {headerEnd}
            </div>
          ) : null}
        </div>
        {expanded && hasBody ? (
          <div
            className={cn(
              "flex flex-col",
              isCollapsible ? "gap-4 pl-5" : "gap-2",
            )}
          >
            {description ? (
              <p
                className={cn(
                  descriptionVariants({ size }),
                  descriptionNoCapture && "ph-no-capture",
                )}
              >
                <RichDescriptionContent description={description} />
              </p>
            ) : null}
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
