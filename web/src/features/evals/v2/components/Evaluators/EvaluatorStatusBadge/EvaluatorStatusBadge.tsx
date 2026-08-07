import { Circle } from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
import { cn } from "@/src/utils/tailwind";

/** Displays whether an evaluator is active, inactive, or blocked. */
export function EvaluatorStatusBadge({
  activeRuleCount,
  blocked = false,
}: {
  activeRuleCount: number;
  blocked?: boolean;
}) {
  const active = activeRuleCount > 0;

  return (
    <Badge
      variant={blocked ? "warning" : active ? "default" : "secondary"}
      className={cn(
        "gap-1.5 whitespace-nowrap",
        active &&
          !blocked &&
          "bg-light-green text-dark-green hover:bg-light-green",
      )}
    >
      <Circle className="h-2 w-2 fill-current" />
      {blocked ? "Blocked" : active ? "Active" : "Inactive"} · {activeRuleCount}
    </Badge>
  );
}
