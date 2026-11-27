import { X } from "@langfuse/icons";

import { planLineIcons } from "@/src/ee/features/billing/constants/planLineIcons";
import { type PlanLine } from "@/src/ee/features/billing/constants/pricingPlans";
import { cn } from "@/src/utils/tailwind";

type PlanLinesListProps = {
  lines: ReadonlyArray<PlanLine>;
  /** Lines the organization gives up: marked with a cross instead of the line's icon. */
  isLoss: boolean;
};

/** A plan's feature lines in two columns, each with its icon. */
export function PlanLinesList({ lines, isLoss }: PlanLinesListProps) {
  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {lines.map((line) => {
        const Icon = isLoss ? X : planLineIcons[line.kind];
        return (
          <li key={line.kind} className="flex items-start gap-2">
            <span
              className={cn(
                "mt-0.5 flex shrink-0",
                isLoss ? "text-destructive" : "text-muted-foreground",
              )}
            >
              <Icon size="sm" aria-hidden />
            </span>
            {line.text}
          </li>
        );
      })}
    </ul>
  );
}
