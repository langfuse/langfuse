import { Circle } from "lucide-react";

import {
  getEvaluatorBlockMetadata,
  type EvaluatorBlockReason,
} from "@langfuse/shared";

import { Badge } from "@/src/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/utils/tailwind";

/** Displays whether an evaluator is active, inactive, or blocked. */
export function EvaluatorStatusBadge({
  ruleCount,
  active,
  blocked = false,
  blockReason = null,
  blockMessage = null,
}: {
  ruleCount: number;
  active: boolean;
  blocked?: boolean;
  blockReason?: EvaluatorBlockReason | null;
  blockMessage?: string | null;
}) {
  const badge = (
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
      {blocked ? "Blocked" : active ? "Active" : "Inactive"} · {ruleCount}
    </Badge>
  );

  // Prefer the message stored when the evaluator was paused — that is what the
  // project was notified with — and fall back to the reason's copy for rows
  // blocked before messages were persisted.
  const explanation = blocked
    ? (blockMessage ??
      (blockReason ? getEvaluatorBlockMetadata(blockReason).message : null))
    : null;

  if (!explanation) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex" tabIndex={0}>
          {badge}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{explanation}</TooltipContent>
    </Tooltip>
  );
}
