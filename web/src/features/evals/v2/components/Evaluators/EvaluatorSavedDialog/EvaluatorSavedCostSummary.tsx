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

export function EvaluatorSavedCostSummary({
  estimates,
  unavailableEstimateCount,
  matchingObservations,
  sampling,
  isEstimating,
  onSamplingChange,
  evaluatorType,
  backfill,
}: {
  estimates: ActivationEstimate[];
  unavailableEstimateCount: number;
  matchingObservations: number;
  sampling: number;
  isEstimating: boolean;
  onSamplingChange: ((sampling: number) => void) | null;
  evaluatorType: EvalTemplateType;
  backfill:
    | { enabled: false }
    | {
        enabled: true;
        matchingObservations: number;
        maxItems: number;
        isEstimating: boolean;
      };
}) {
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
          <h3 className="text-sm font-bold">Sampling</h3>
          {!onSamplingChange ? (
            <InfoTooltip label="Sampling is set by the selected rule">
              The sampling rate is inherited from the selected rule. You can
              edit it directly in the rule.
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
        <h3 className="text-sm font-bold">Matches</h3>
        {isEstimating ? (
          <div className="mt-2 space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        ) : (
          <>
            <p className="mt-1 font-mono text-base font-bold tabular-nums">
              {compactNumberFormatter(matchingObservations, 1)} / week
            </p>
            <p className="text-muted-foreground text-xs tabular-nums">
              {compactNumberFormatter(sampledObservations, 1)} sampled
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
              <p className="text-muted-foreground mb-1 font-mono text-[10px] tracking-wider uppercase">
                Recurring
              </p>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-lg font-bold tabular-nums">
                  {estimatedCostUsd === null
                    ? "Unavailable"
                    : `≈ ${usdFormatter(estimatedCostUsd, 2, 2)}`}
                </span>
                <InfoTooltip label="How estimated LLM costs are calculated">
                  {formatEvaluatorCostCalculation({
                    matchingObservations,
                    sampling,
                    testRunCostUsd: estimate?.testRunCostUsd ?? null,
                    estimatedCostUsd,
                    evaluatorType,
                  })}
                </InfoTooltip>
              </div>
              <p className="text-muted-foreground text-xs">
                estimated LLM costs / week
              </p>
              {unavailableEstimateCount > 0 ? (
                <p className="text-muted-foreground mt-2 text-xs">
                  No recent cost-bearing evaluator trace or successful fallback
                  test was available.
                </p>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {evaluatorType !== EvalTemplateTypeEnum.CODE && backfill.enabled ? (
        <section className="border-t border-dashed pt-4">
          {backfill.isEstimating ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
          ) : (
            <>
              <p className="text-muted-foreground mb-1 font-mono text-[10px] tracking-wider uppercase">
                One-time backfill
              </p>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-lg font-bold tabular-nums">
                  {estimate
                    ? `≈ ${usdFormatter(
                        Math.min(
                          backfill.matchingObservations,
                          backfill.maxItems,
                        ) *
                          sampling *
                          estimate.testRunCostUsd,
                        2,
                        2,
                      )}`
                    : "Unavailable"}
                </span>
                <InfoTooltip label="How estimated backfill costs are calculated">
                  The estimate applies this evaluator&apos;s observed per-run
                  cost and the selected sampling rate to up to{" "}
                  {compactNumberFormatter(backfill.maxItems, 1)} matching
                  observations.
                </InfoTooltip>
              </div>
              <p className="text-muted-foreground text-xs">
                estimated LLM costs, once
              </p>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
