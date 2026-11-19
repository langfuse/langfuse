import { cn } from "@/src/utils/tailwind";

const dotClasses = {
  reached: "bg-dark-red",
  // `dark-yellow` reads as brown in light mode.
  near: "bg-yellow-400 dark:bg-dark-yellow",
} as const;

type GatewaySpendBudgetStatusDotProps = {
  status: keyof typeof dotClasses;
};

/** Marks a budget that is nearly or fully used. */
export function GatewaySpendBudgetStatusDot({
  status,
}: GatewaySpendBudgetStatusDotProps) {
  return (
    <span
      aria-hidden
      className={cn("size-1.5 shrink-0 rounded-full", dotClasses[status])}
    />
  );
}
