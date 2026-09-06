import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { formatEvaluatorCostCalculation } from "@/src/features/evals/v2/fns/formatEvaluatorCostCalculation";
import type { RuleCostEstimate } from "@/src/features/evals/v2/hooks/useRuleCostEstimate";
import { usdFormatter } from "@/src/utils/numbers";
import { useTranslations } from "next-intl";

export function RuleEvaluatorCostEstimate({
  estimate,
}: {
  estimate: RuleCostEstimate;
}) {
  const t = useTranslations("evaluationAnalytics.evaluations");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help font-mono text-sm tabular-nums underline decoration-dotted underline-offset-4">
          {estimate.estimatedCostUsd === null
            ? t("unavailable")
            : t("rules.cost.amountPerWeek", {
                amount: usdFormatter(estimate.estimatedCostUsd, 2, 2),
              })}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        {formatEvaluatorCostCalculation({
          ...estimate,
          messages: {
            codeEvaluatorNoCost: t("rules.cost.calculation.codeNoCost"),
            formatZeroCost: (values) =>
              t("rules.cost.calculation.zeroCost", values),
            unavailable: t("rules.cost.calculation.unavailable"),
            formatEstimatedCost: (values) =>
              t("rules.cost.calculation.estimatedCost", values),
            formatMatchingObservations: (count) =>
              t("rules.cost.calculation.matchingObservations", { count }),
            formatSamplingRate: (rate) =>
              t("rules.cost.calculation.samplingRate", { rate }),
            scope: t("rules.cost.calculation.scope"),
          },
        })}
      </TooltipContent>
    </Tooltip>
  );
}
