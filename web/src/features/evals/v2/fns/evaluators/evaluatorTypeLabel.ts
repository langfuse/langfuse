import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

/** Product wording for each evaluator type, shared by badges and filters. */
export function evaluatorTypeLabel(type: EvalTemplateType): string {
  switch (type) {
    case EvalTemplateTypeEnum.CODE:
      return "Code";
    case EvalTemplateTypeEnum.DECISION_MODEL:
      return "Decision model (experimental)";
    case EvalTemplateTypeEnum.LLM_AS_JUDGE:
      return "LLM as a judge";
  }
}
