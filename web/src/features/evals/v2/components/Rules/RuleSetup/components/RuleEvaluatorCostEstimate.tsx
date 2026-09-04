import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { formatEvaluatorCostCalculation } from "@/src/features/evals/v2/fns/formatEvaluatorCostCalculation";
import type { RuleCostEstimate } from "@/src/features/evals/v2/hooks/useRuleCostEstimate";
import { usdFormatter } from "@/src/utils/numbers";

export function RuleEvaluatorCostEstimate({
  estimate,
}: {
  estimate: RuleCostEstimate;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help font-mono text-sm tabular-nums underline decoration-dotted underline-offset-4">
          {estimate.estimatedCostUsd === null
            ? "Unavailable"
            : estimate.period === "selection"
              ? `≈ ${usdFormatter(estimate.estimatedCostUsd, 2, 2)}`
              : `≈ ${usdFormatter(estimate.estimatedCostUsd, 2, 2)} / week`}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        {formatEvaluatorCostCalculation(estimate)}
      </TooltipContent>
    </Tooltip>
  );
}
