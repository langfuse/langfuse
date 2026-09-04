import { type EvalTemplateType, EvalTemplateTypeEnum } from "@langfuse/shared";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";

export function formatEvaluatorCostCalculation({
  matchingObservations,
  sampling,
  testRunCostUsd,
  estimatedCostUsd,
  evaluatorType,
  period = "week",
}: {
  matchingObservations: number;
  sampling: number;
  testRunCostUsd: number | null;
  estimatedCostUsd: number | null;
  evaluatorType: EvalTemplateType;
  period?: "week" | "selection";
}) {
  if (evaluatorType === EvalTemplateTypeEnum.CODE) {
    return "Code evaluators do not call an LLM, so they do not incur model-provider / LLM costs.";
  }

  const isSelection = period === "selection";
  const observations = isSelection
    ? `${numberFormatter(matchingObservations, 0)} observations`
    : `${numberFormatter(matchingObservations, 0)} matching observations`;
  const samplingRate = `${numberFormatter(sampling * 100, 0, 2)}% sampling`;
  const periodLabel = isSelection ? "for this run" : "/ week";
  const scope = isSelection
    ? "Expected cost on your linked API key (not Langfuse)."
    : "Expected cost on your linked API key (not Langfuse). Matching observations are based on the last 7 days.";

  if (matchingObservations === 0) {
    return `${observations} × ${samplingRate} = ≈ ${usdFormatter(0, 2, 2)} ${periodLabel}. ${scope}`;
  }
  if (testRunCostUsd === null || estimatedCostUsd === null) {
    const window = isSelection ? "" : " from the last 7 days";
    return `No cost-bearing evaluator trace was available${window}, and the fallback test call did not return a usable model cost. Expected cost would be charged to your linked API key, not Langfuse.`;
  }

  return `${observations} × ${samplingRate} × ${usdFormatter(testRunCostUsd, 2, 6)} per evaluation = ≈ ${usdFormatter(estimatedCostUsd, 2, 2)} ${periodLabel}. ${scope} Per-evaluation cost uses the latest cost-bearing evaluator trace from that period, or a fallback test call.`;
}
