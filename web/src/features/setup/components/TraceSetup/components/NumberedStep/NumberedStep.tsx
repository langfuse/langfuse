import type { ReactNode } from "react";
import { Check } from "@langfuse/icons";
import { cn } from "@/src/utils/tailwind";
import motion from "../../motion.module.css";

/**
 * One step of a setup list, drawn like the tracing onboarding's steps: a filled number, with a line down to the next.
 * A done step (its part copied) shows a green check in place of its number.
 */
export function NumberedStep({
  number,
  isDone,
  children,
}: {
  number: number;
  isDone: boolean;
  children: ReactNode;
}) {
  return (
    <li className="group/step grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3">
      <div aria-hidden="true" className="flex flex-col items-center">
        <span
          className={cn(
            "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors duration-200",
            isDone
              ? cn("bg-dark-green text-white", motion.checkIn)
              : "bg-foreground text-background",
          )}
        >
          {isDone ? <Check size="sm" /> : number}
        </span>
        <span className="bg-border my-1.5 w-px flex-1 group-last/step:hidden" />
      </div>
      <div className="flex min-w-0 flex-col gap-2 pb-5 group-last/step:pb-0">
        {children}
      </div>
    </li>
  );
}
