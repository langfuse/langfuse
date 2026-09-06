import { EvalTemplateTypeEnum } from "@langfuse/shared";

import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { RuleEvaluatorCostEstimate } from "@/src/features/evals/v2/components/Rules/RuleSetup/components/RuleEvaluatorCostEstimate";
import { usdFormatter } from "@/src/utils/numbers";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("evaluationAnalytics.evaluations");
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
            <InfoTooltip label={t("rules.cost.aboutTotal")}>
              {t("rules.cost.totalTooltip")}
            </InfoTooltip>
          </div>
          <p className="text-muted-foreground text-xs whitespace-nowrap">
            {t("rules.cost.estimatedPerWeek")}
          </p>
        </div>
      </div>
    </div>
  );
}
