import { type EvalTemplateType, EvalTemplateTypeEnum } from "@langfuse/shared";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Slider } from "@/src/components/ui/slider";
import {
  SAMPLING_SLIDER_MIN,
  SAMPLING_SLIDER_STEP,
} from "@/src/features/evals/v2/constants/ruleSampling";
import type { ActivationEstimate } from "@/src/features/evals/v2/fns/requestRuleActivation";
import { formatEvaluatorCostCalculation } from "@/src/features/evals/v2/fns/formatEvaluatorCostCalculation";
import { compactNumberFormatter, usdFormatter } from "@/src/utils/numbers";
import { useTranslations } from "next-intl";

export function EvaluatorSavedCostSummary({
  estimates,
  unavailableEstimateCount,
  matchingObservations,
  sampling,
  isEstimating,
  onSamplingChange,
  evaluatorType,
}: {
  estimates: ActivationEstimate[];
  unavailableEstimateCount: number;
  matchingObservations: number;
  sampling: number;
  isEstimating: boolean;
  onSamplingChange: ((sampling: number) => void) | null;
  evaluatorType: EvalTemplateType;
}) {
  const t = useTranslations("evaluationAnalytics.evaluations");
  const estimate = estimates[0];
  const sampledObservations = Math.round(matchingObservations * sampling);
  const estimatedCostUsd =
    matchingObservations === 0
      ? 0
      : estimate
        ? estimate.matchingObservations * sampling * estimate.testRunCostUsd
        : null;

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-bold">
            {t("evaluator.savedDialog.cost.sampling")}
          </h3>
          {!onSamplingChange ? (
            <InfoTooltip
              label={t("evaluator.savedDialog.cost.samplingSetByRule")}
            >
              {t("evaluator.savedDialog.cost.samplingInherited")}
            </InfoTooltip>
          ) : null}
        </div>
        <Slider
          min={SAMPLING_SLIDER_MIN}
          max={1}
          step={SAMPLING_SLIDER_STEP}
          value={[sampling]}
          showInput
          displayAsPercentage
          disabled={!onSamplingChange}
          onValueChange={(value) => onSamplingChange?.(value[0] ?? sampling)}
        />
      </section>

      <section>
        <h3 className="text-sm font-bold">
          {t("evaluator.savedDialog.cost.matches")}
        </h3>
        {isEstimating ? (
          <div className="mt-2 space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        ) : (
          <>
            <p className="mt-1 font-mono text-base font-bold tabular-nums">
              {t("evaluator.savedDialog.cost.perWeek", {
                count: compactNumberFormatter(matchingObservations, 1),
              })}
            </p>
            <p className="text-muted-foreground text-xs tabular-nums">
              {t("evaluator.savedDialog.cost.sampled", {
                count: compactNumberFormatter(sampledObservations, 1),
              })}
            </p>
          </>
        )}
      </section>

      {evaluatorType !== EvalTemplateTypeEnum.CODE ? (
        <section className="border-t border-dashed pt-4">
          {isEstimating ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-lg font-bold tabular-nums">
                  {estimatedCostUsd === null
                    ? t("unavailable")
                    : `≈ ${usdFormatter(estimatedCostUsd, 2, 2)}`}
                </span>
                <InfoTooltip
                  label={t("evaluator.savedDialog.cost.howCalculated")}
                >
                  {formatEvaluatorCostCalculation({
                    matchingObservations,
                    sampling,
                    testRunCostUsd: estimate?.testRunCostUsd ?? null,
                    estimatedCostUsd,
                    evaluatorType,
                    messages: {
                      codeEvaluatorNoCost: t(
                        "rules.cost.calculation.codeNoCost",
                      ),
                      formatZeroCost: (values) =>
                        t("rules.cost.calculation.zeroCost", values),
                      unavailable: t("rules.cost.calculation.unavailable"),
                      formatEstimatedCost: (values) =>
                        t("rules.cost.calculation.estimatedCost", values),
                      formatMatchingObservations: (count) =>
                        t("rules.cost.calculation.matchingObservations", {
                          count,
                        }),
                      formatObservations: (count) =>
                        t("rules.cost.calculation.observations", { count }),
                      formatSamplingRate: (rate) =>
                        t("rules.cost.calculation.samplingRate", { rate }),
                      scope: t("rules.cost.calculation.scope"),
                      selectionScope: t(
                        "rules.cost.calculation.selectionScope",
                      ),
                      selectionUnavailable: t(
                        "rules.cost.calculation.selectionUnavailable",
                      ),
                      formatZeroSelectionCost: (values) =>
                        t("rules.cost.calculation.zeroSelectionCost", values),
                      formatEstimatedSelectionCost: (values) =>
                        t(
                          "rules.cost.calculation.estimatedSelectionCost",
                          values,
                        ),
                    },
                  })}
                </InfoTooltip>
              </div>
              <p className="text-muted-foreground text-xs">
                {t("rules.cost.estimatedPerWeek")}
              </p>
              {unavailableEstimateCount > 0 ? (
                <p className="text-muted-foreground mt-2 text-xs">
                  {t("evaluator.savedDialog.cost.noRecentCost")}
                </p>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
