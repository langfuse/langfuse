/* eslint-disable no-nested-ternary */
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { EvaluatorCostCalculationTooltipContent } from "@/src/features/evals/v2/components/EvaluatorCostCalculationTooltipContent/EvaluatorCostCalculationTooltipContent";
import { formatEvaluatorCostCalculation } from "@/src/features/evals/v2/fns/formatEvaluatorCostCalculation";
import type { RuleCostEstimate } from "@/src/features/evals/v2/hooks/useRuleCostEstimate";
import { usdFormatter } from "@/src/utils/numbers";

export function RuleEvaluatorCostEstimate({
  estimate,
}: {
  estimate: RuleCostEstimate;
}) {
  return (
    <CustomTooltip
      delay={300}
      content={
        <EvaluatorCostCalculationTooltipContent
          {...formatEvaluatorCostCalculation(estimate)}
        />
      }
    >
      {({ getTriggerProps }) => (
        <span
          {...getTriggerProps()}
          className="cursor-help font-mono text-sm tabular-nums underline decoration-dotted underline-offset-4"
        >
          {estimate.estimatedCostUsd === null
            ? "Unavailable"
            : estimate.period === "selection"
              ? `≈ ${usdFormatter(estimate.estimatedCostUsd, 2, 2)}`
              : `≈ ${usdFormatter(estimate.estimatedCostUsd, 2, 2)} / week`}
        </span>
      )}
    </CustomTooltip>
  );
}
