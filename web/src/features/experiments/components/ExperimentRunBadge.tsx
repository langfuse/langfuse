import { type ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";

/** Badge tinted with a run's colour; the colour is data, so not a Badge variant. */
export function ExperimentRunBadge({
  children,
  colorClass,
  strong = false,
}: ExperimentRunBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5.5 w-fit max-w-full min-w-0 shrink-0 items-center gap-1.5 rounded-sm border px-2 text-xs leading-none",
        colorClass ?? "bg-muted text-foreground-secondary border-transparent",
        strong && "font-bold",
      )}
    >
      {children}
    </span>
  );
}

type ExperimentRunBadgeProps = {
  children: ReactNode;
  /** `badgeClass` from `getExperimentColorStyles`; muted when absent. */
  colorClass?: string;
  strong?: boolean;
};
