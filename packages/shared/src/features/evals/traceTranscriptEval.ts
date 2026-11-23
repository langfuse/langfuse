import { EvalTemplateTypeEnum } from "./types";

/**
 * Judge and decision-model assignments. Code evaluators are not scheduled here.
 */
export const TRACE_TRANSCRIPT_EVAL_TYPES = [
  EvalTemplateTypeEnum.LLM_AS_JUDGE,
  EvalTemplateTypeEnum.DECISION_MODEL,
] as const;
