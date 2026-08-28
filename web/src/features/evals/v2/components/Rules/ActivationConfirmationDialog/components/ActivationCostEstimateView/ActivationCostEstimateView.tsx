import { EvalTemplateTypeEnum } from "@langfuse/shared";

import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { RuleEvaluatorCostEstimate } from "@/src/features/evals/v2/components/Rules/RuleSetup/components/RuleEvaluatorCostEstimate";
import { usdFormatter } from "@/src/utils/numbers";

export function ActivationCostEstimateView({
  estimates,
}: {
  estimates: Array<{
    evaluatorId: string;
    evaluatorName: string;
    matchingObservations: number;
    sampling: number;
    testRunCostUsd: number;
    estimatedCostUsd: number;
  }>;
}) {
  const totalCostUsd = estimates.reduce(
    (total, estimate) => total + estimate.estimatedCostUsd,
    0,
  );

  return (
    <div className="space-y-3">
      <ul className="overflow-hidden rounded-md border">
        {estimates.map((estimate) => (
          <li
            key={estimate.evaluatorId}
            className="flex min-h-11 items-center justify-between gap-3 border-b px-3 last:border-b-0"
          >
            <span
              className="min-w-0 truncate text-sm"
              title={estimate.evaluatorName}
            >
              {estimate.evaluatorName}
            </span>
            <RuleEvaluatorCostEstimate
              estimate={{
                ...estimate,
                evaluatorType: EvalTemplateTypeEnum.LLM_AS_JUDGE,
              }}
            />
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <div className="w-48 border-t pt-2 text-right text-sm">
          <div className="flex items-center justify-end gap-1.5">
            <p className="font-mono font-bold whitespace-nowrap tabular-nums">
              ≈ {usdFormatter(totalCostUsd, 2, 2)}
            </p>
            <InfoTooltip label="About total estimated LLM costs">
              Sum of the available weekly LLM cost estimates for attached
              evaluators.
            </InfoTooltip>
          </div>
          <p className="text-muted-foreground text-xs whitespace-nowrap">
            estimated LLM costs / week
          </p>
        </div>
      </div>
    </div>
  );
}
