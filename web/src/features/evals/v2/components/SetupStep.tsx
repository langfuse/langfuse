import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/src/utils/tailwind";

/**
 * Datadog-style vertical stepper section: a numbered circle with a connector
 * line down to the next step, and a collapsible header that toggles the step
 * body. Supports controlled expansion for flows that gate later steps.
 */
export function SetupStep({
  number,
  title,
  summary,
  isLast = false,
  defaultOpen = true,
  open,
  disabled = false,
  onOpenChange,
  children,
}: {
  number: number;
  title: string;
  summary?: string;
  isLast?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const expanded = open ?? internalOpen;

  const toggle = () => {
    if (disabled) return;
    const nextOpen = !expanded;
    if (onOpenChange) {
      onOpenChange(nextOpen);
      return;
    }
    setInternalOpen(nextOpen);
  };

  return (
    <div className={cn("flex gap-3", disabled && "opacity-50")}>
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm",
            disabled
              ? "bg-muted text-muted-foreground"
              : "bg-primary text-primary-foreground",
          )}
        >
          {number}
        </div>
        {!isLast && <div className="bg-border my-1 w-px flex-1" />}
      </div>

      <div className={cn("flex min-w-0 flex-1 flex-col", !isLast && "pb-8")}>
        <button
          type="button"
          className="flex min-h-7 items-center gap-1.5 text-left disabled:cursor-not-allowed"
          aria-label={`Step ${number}: ${title}`}
          aria-expanded={expanded}
          disabled={disabled}
          onClick={toggle}
        >
          <ChevronDown
            className={cn(
              "text-muted-foreground h-4 w-4 shrink-0 transition-transform",
              !expanded && "-rotate-90",
            )}
          />
          <span className="text-lg font-bold">{title}</span>
          {summary ? (
            <span
              className="text-muted-foreground ml-1 truncate text-xs"
              title={summary}
            >
              {summary}
            </span>
          ) : null}
        </button>
        {expanded && (
          <div className="mt-3 flex flex-col gap-4 pl-5.5">{children}</div>
        )}
      </div>
    </div>
  );
}
