import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/src/utils/tailwind";

/**
 * Datadog-style vertical stepper section: a numbered circle with a connector
 * line down to the next step, and a collapsible header that toggles the step
 * body. Purely presentational, except `disabled`: a not-yet-reachable step
 * renders muted with an optional hint instead of its body.
 */
export function SetupStep({
  number,
  title,
  isLast = false,
  defaultOpen = true,
  disabled = false,
  disabledHint,
  children,
}: {
  number: number;
  title: string;
  isLast?: boolean;
  defaultOpen?: boolean;
  /** Step is not reachable yet: muted header, no body. */
  disabled?: boolean;
  /** Shown under a disabled step's title (e.g. "Pick a data source first"). */
  disabledHint?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-medium",
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
          className="flex h-7 items-center gap-1.5 text-left"
          aria-expanded={!disabled && open}
          disabled={disabled}
          onClick={() => setOpen((prev) => !prev)}
        >
          {disabled ? (
            // Chevron-width spacer keeps disabled titles aligned with the rest.
            <span className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronDown
              className={cn(
                "text-muted-foreground h-4 w-4 shrink-0 transition-transform",
                !open && "-rotate-90",
              )}
            />
          )}
          <span
            className={cn(
              "text-lg font-semibold",
              disabled && "text-muted-foreground",
            )}
          >
            {title}
          </span>
        </button>
        {disabled ? (
          disabledHint ? (
            // mt-1.5 reads as the same title → description spacing as the
            // form's gap-2 sections: the text-lg step title carries ~2px
            // more trailing line leading than their text-sm labels.
            <p className="text-muted-foreground mt-1.5 pl-5.5 text-sm">
              {disabledHint}
            </p>
          ) : null
        ) : (
          open && (
            <div className="mt-1.5 flex flex-col gap-6 pl-5.5">{children}</div>
          )
        )}
      </div>
    </div>
  );
}
