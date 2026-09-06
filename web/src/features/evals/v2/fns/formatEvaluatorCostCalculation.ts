import { type EvalTemplateType, EvalTemplateTypeEnum } from "@langfuse/shared";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";

export type EvaluatorCostCalculationMessages = {
  codeEvaluatorNoCost: string;
  formatZeroCost: (values: {
    observations: string;
    samplingRate: string;
    weeklyCost: string;
    scope: string;
  }) => string;
  unavailable: string;
  formatEstimatedCost: (values: {
    observations: string;
    samplingRate: string;
    costPerEvaluation: string;
    weeklyCost: string;
    scope: string;
  }) => string;
  formatMatchingObservations: (count: string) => string;
  formatSamplingRate: (rate: string) => string;
  scope: string;
};

const DEFAULT_MESSAGES: EvaluatorCostCalculationMessages = {
  codeEvaluatorNoCost:
    "Code evaluators do not call an LLM, so they do not incur model-provider / LLM costs.",
  formatZeroCost: ({ observations, samplingRate, weeklyCost, scope }) =>
    `${observations} × ${samplingRate} = ≈ ${weeklyCost} / week. ${scope}`,
  unavailable:
    "No cost-bearing evaluator trace was available from the last 7 days, and the fallback test call did not return a usable model cost. Expected cost would be charged to your linked API key, not Langfuse.",
  formatEstimatedCost: ({
    observations,
    samplingRate,
    costPerEvaluation,
    weeklyCost,
    scope,
  }) =>
    `${observations} × ${samplingRate} × ${costPerEvaluation} per evaluation = ≈ ${weeklyCost} / week. ${scope} Per-evaluation cost uses the latest cost-bearing evaluator trace from that period, or a fallback test call.`,
  formatMatchingObservations: (count) => `${count} matching observations`,
  formatSamplingRate: (rate) => `${rate}% sampling`,
  scope:
    "Expected cost on your linked API key (not Langfuse). Matching observations are based on the last 7 days.",
};

export function formatEvaluatorCostCalculation({
  matchingObservations,
  sampling,
  testRunCostUsd,
  estimatedCostUsd,
  evaluatorType,
  messages = DEFAULT_MESSAGES,
}: {
  matchingObservations: number;
  sampling: number;
  testRunCostUsd: number | null;
  estimatedCostUsd: number | null;
  evaluatorType: EvalTemplateType;
  messages?: EvaluatorCostCalculationMessages;
}) {
  if (evaluatorType === EvalTemplateTypeEnum.CODE) {
    return messages.codeEvaluatorNoCost;
  }

  const observations = messages.formatMatchingObservations(
    numberFormatter(matchingObservations, 0),
  );
  const samplingRate = messages.formatSamplingRate(
    numberFormatter(sampling * 100, 0, 2),
  );

  if (matchingObservations === 0) {
    return messages.formatZeroCost({
      observations,
      samplingRate,
      weeklyCost: usdFormatter(0, 2, 2),
      scope: messages.scope,
    });
  }
  if (testRunCostUsd === null || estimatedCostUsd === null) {
    return messages.unavailable;
  }

  return messages.formatEstimatedCost({
    observations,
    samplingRate,
    costPerEvaluation: usdFormatter(testRunCostUsd, 2, 6),
    weeklyCost: usdFormatter(estimatedCostUsd, 2, 2),
    scope: messages.scope,
  });
}
