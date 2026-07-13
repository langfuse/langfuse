import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/src/utils/tailwind";

/**
 * Datadog-style vertical stepper section: a numbered circle with a connector
 * line down to the next step, and a collapsible header that toggles the step
 * body. Purely presentational — steps don't gate each other.
 */
export function SetupStep({
  number,
  title,
  isLast = false,
  defaultOpen = true,
  children,
}: {
  number: number;
  title: string;
  isLast?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="bg-primary text-primary-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-medium">
          {number}
        </div>
        {!isLast && <div className="bg-border my-1 w-px flex-1" />}
      </div>

      <div className={cn("flex min-w-0 flex-1 flex-col", !isLast && "pb-8")}>
        <button
          type="button"
          className="flex h-7 items-center gap-1.5 text-left"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
        >
          <ChevronDown
            className={cn(
              "text-muted-foreground h-4 w-4 shrink-0 transition-transform",
              !open && "-rotate-90",
            )}
          />
          <span className="text-lg font-semibold">{title}</span>
        </button>
        {open && (
          <div className="mt-3 flex flex-col gap-6 pl-5.5">{children}</div>
        )}
      </div>
    </div>
  );
}
