import { Circle } from "lucide-react";

import { Badge } from "@/src/components/ui/badge";

/** Displays whether an evaluator is connected to active evaluation rules. */
export function EvaluatorActiveStatusBadge({
  activeRuleCount,
}: {
  activeRuleCount: number;
}) {
  const active = activeRuleCount > 0;

  return (
    <Badge
      variant={active ? "default" : "secondary"}
      className={
        active
          ? "bg-light-green text-dark-green hover:bg-light-green gap-1.5 whitespace-nowrap"
          : "gap-1.5 whitespace-nowrap"
      }
    >
      <Circle className="h-2 w-2 fill-current" />
      {active ? "Active" : "Inactive"} · {activeRuleCount}
    </Badge>
  );
}
