import { type EvalTemplateType, EvalTemplateTypeEnum } from "@langfuse/shared";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";

export function formatEvaluatorCostCalculation({
  matchingObservations,
  sampling,
  testRunCostUsd,
  estimatedCostUsd,
  evaluatorType,
}: {
  matchingObservations: number;
  sampling: number;
  testRunCostUsd: number | null;
  estimatedCostUsd: number | null;
  evaluatorType: EvalTemplateType;
}) {
  if (evaluatorType === EvalTemplateTypeEnum.CODE) {
    return "Code evaluators do not call an LLM, so they do not incur model-provider / LLM costs.";
  }

  const observations = `${numberFormatter(matchingObservations, 0)} matching observations`;
  const samplingRate = `${numberFormatter(sampling * 100, 0, 2)}% sampling`;
  const scope = "Estimated model-provider / LLM cost only.";

  if (matchingObservations === 0) {
    return `${observations} × ${samplingRate} = ≈ ${usdFormatter(0, 2, 2)} / week. ${scope}`;
  }
  if (testRunCostUsd === null || estimatedCostUsd === null) {
    return `No cost-bearing evaluator trace was available from the last 7 days, and the fallback test call did not return a usable model cost. ${scope}`;
  }

  return `${observations} × ${samplingRate} × ${usdFormatter(testRunCostUsd, 2, 6)} per evaluation = ≈ ${usdFormatter(estimatedCostUsd, 2, 2)} / week. ${scope}`;
}
