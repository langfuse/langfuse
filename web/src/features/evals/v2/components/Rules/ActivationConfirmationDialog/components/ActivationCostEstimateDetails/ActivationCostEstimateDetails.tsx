import { Slider } from "@/src/components/ui/slider";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import type { ActivationEstimate } from "@/src/features/evals/v2/fns/requestRuleActivation";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { ActivationCostEstimateView } from "../ActivationCostEstimateView/ActivationCostEstimateView";

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
    ? "No observations matched this rule in the last 7 days, so there is nothing to estimate yet. It will evaluate matching observations as they arrive."
    : hasOnlyUnavailableEstimates
      ? "Activating this rule may incur costs. Are you sure you want to continue?"
      : `${compactNumberFormatter(matchingObservations, 1)} observations matched this rule in the last 7 days. Rates come from each evaluator's latest test call.`;

  return (
    <div className="flex flex-col gap-4">
      {descriptionAsTooltip ? (
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold">Cost estimation</p>
            <InfoTooltip label="About cost estimation">
              {description}
            </InfoTooltip>
          </div>
          <p className="text-muted-foreground text-sm">
            Review the expected cost before running this evaluator
            automatically.
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{description}</p>
      )}

      {estimates.length > 0 ? (
        <>
          {onSamplingChange ? (
            <div className="space-y-2">
              <p className="text-sm font-bold">Sampling rate</p>
              <Slider
                min={0}
                max={1}
                step={0.0001}
                value={[sampling]}
                showInput
                displayAsPercentage
                decimalPlaces={0}
                onValueChange={(value) =>
                  onSamplingChange(value[0] ?? sampling)
                }
              />
              <p className="text-muted-foreground text-xs">
                Each evaluator would run on{" "}
                <span className="text-foreground font-bold tabular-nums">
                  {compactNumberFormatter(sampledObservations, 1)}
                </span>{" "}
                of the {compactNumberFormatter(matchingObservations, 1)}{" "}
                matching observations.
              </p>
            </div>
          ) : null}

          <ActivationCostEstimateView estimates={estimates} />
        </>
      ) : null}

      {unavailableEstimateCount > 0 && !hasOnlyUnavailableEstimates ? (
        <p className="text-muted-foreground text-sm">
          No cost estimate is available for {unavailableEstimateCount} other LLM
          evaluator
          {unavailableEstimateCount === 1 ? "" : "s"}.
        </p>
      ) : null}
    </div>
  );
}
