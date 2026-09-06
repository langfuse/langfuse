import { Slider } from "@/src/components/ui/slider";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import {
  SAMPLING_SLIDER_MIN,
  SAMPLING_SLIDER_STEP,
} from "@/src/features/evals/v2/constants/ruleSampling";
import type { ActivationEstimate } from "@/src/features/evals/v2/fns/requestRuleActivation";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { ActivationCostEstimateView } from "../ActivationCostEstimateView/ActivationCostEstimateView";
import { useTranslations } from "next-intl";

export function ActivationCostEstimateDetails({
  estimates: baseEstimates,
  unavailableEstimateCount,
  matchingObservations,
  sampling,
  onSamplingChange,
  descriptionAsTooltip = false,
}: {
  estimates: ActivationEstimate[];
  unavailableEstimateCount: number;
  matchingObservations: number;
  sampling: number;
  onSamplingChange?: (sampling: number) => void;
  descriptionAsTooltip?: boolean;
}) {
  const t = useTranslations("evaluationAnalytics.evaluations");
  const hasNoMatchingObservations = matchingObservations === 0;
  const hasOnlyUnavailableEstimates =
    baseEstimates.length === 0 && unavailableEstimateCount > 0;
  const sampledObservations = Math.round(matchingObservations * sampling);
  const estimates = baseEstimates.map((estimate) => ({
    ...estimate,
    sampling,
    estimatedCostUsd:
      estimate.matchingObservations * sampling * estimate.testRunCostUsd,
  }));
  const description = hasNoMatchingObservations
    ? t("rules.activation.noMatches")
    : hasOnlyUnavailableEstimates
      ? t("rules.activation.costMayApply")
      : t("rules.activation.matchCount", {
          count: matchingObservations,
          formattedCount: compactNumberFormatter(matchingObservations, 1),
        });

  return (
    <div className="flex flex-col gap-4">
      {descriptionAsTooltip ? (
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold">
              {t("rules.activation.costEstimation")}
            </p>
            <InfoTooltip label={t("rules.activation.aboutCostEstimation")}>
              {description}
            </InfoTooltip>
          </div>
          <p className="text-muted-foreground text-sm">
            {t("rules.activation.reviewCost")}
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{description}</p>
      )}

      {estimates.length > 0 ? (
        <>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold">{t("rules.sampling.title")}</p>
              <InfoTooltip label={t("rules.sampling.about")}>
                {t("rules.sampling.tooltip")}
              </InfoTooltip>
            </div>
            <Slider
              min={SAMPLING_SLIDER_MIN}
              max={1}
              step={SAMPLING_SLIDER_STEP}
              value={[sampling]}
              showInput
              displayAsPercentage
              disabled={!onSamplingChange}
              onValueChange={(value) =>
                onSamplingChange?.(value[0] ?? sampling)
              }
            />
            <p className="text-muted-foreground text-xs">
              {t("rules.activation.samplingSummary", {
                evaluatorCount: estimates.length,
                sampled: compactNumberFormatter(sampledObservations, 1),
                matching: compactNumberFormatter(matchingObservations, 1),
              })}
            </p>
          </div>

          <ActivationCostEstimateView estimates={estimates} />
        </>
      ) : null}

      {unavailableEstimateCount > 0 && !hasOnlyUnavailableEstimates ? (
        <p className="text-muted-foreground text-sm">
          {t("rules.activation.unavailableEstimateCount", {
            count: unavailableEstimateCount,
          })}
        </p>
      ) : null}
    </div>
  );
}
