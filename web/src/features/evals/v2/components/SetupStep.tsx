import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/src/utils/tailwind";

/**
 * Datadog-style vertical stepper section: a numbered circle with a connector
 * line down to the next step, and a collapsible header that toggles the step
 * body. Supports controlled expansion for progressive flows.
 */
export function SetupStep({
  number,
  title,
  description,
  compactBottomSpacing = false,
  isLast = false,
  defaultOpen = true,
  open,
  onOpenChange,
  children,
}: {
  number: number;
  title: string;
  description?: ReactNode;
  compactBottomSpacing?: boolean;
  isLast?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const expanded = open ?? internalOpen;

  const toggle = () => {
    const nextOpen = !expanded;
    if (onOpenChange) {
      onOpenChange(nextOpen);
      return;
    }
    setInternalOpen(nextOpen);
  };

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="bg-primary text-primary-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm">
          {number}
        </div>
        {!isLast && <div className="bg-border my-1 w-px flex-1" />}
      </div>

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          !isLast && (compactBottomSpacing ? "pb-3" : "pb-8"),
        )}
      >
        <button
          type="button"
          className="flex min-h-7 items-center gap-1.5 text-left"
          aria-label={`Step ${number}: ${title}`}
          aria-expanded={expanded}
          onClick={toggle}
        >
          <ChevronDown
            className={cn(
              "text-muted-foreground h-4 w-4 shrink-0 transition-transform",
              !expanded && "-rotate-90",
            )}
          />
          <span className="text-lg font-bold">{title}</span>
        </button>
        {expanded && (
          <div className="mt-2 flex flex-col gap-4 pl-5.5">
            {description ? (
              <p className="text-muted-foreground text-sm">{description}</p>
            ) : null}
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
