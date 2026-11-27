import type { EvalTemplateType } from "@langfuse/shared";

export function getEvaluatorNameStep(type: EvalTemplateType): number {
  return type === "LLM_AS_JUDGE" || type === "DECISION_MODEL" ? 3 : 2;
}
