import { type EvalTemplateType } from "@prisma/client";

import { toEvalVariables } from "../../server/transcript/eval-threads";
import { EvalTemplateTypeEnum } from "./types";
import { extractValueFromObject } from "./utilities";

/** The only source column a trace transcript eval variable can map to. */
export const TRACE_TRANSCRIPT_EVAL_COLUMN = "threads";

/**
 * Evaluator types a trace transcript rule can run. Code evaluators receive
 * the whole transcript instead of mapped variables.
 */
export const TRACE_TRANSCRIPT_EVAL_TYPES = [
  EvalTemplateTypeEnum.LLM_AS_JUDGE,
  EvalTemplateTypeEnum.DECISION_MODEL,
  EvalTemplateTypeEnum.CODE,
] as const;

export function isTraceTranscriptEvalType(type: EvalTemplateType) {
  return (TRACE_TRANSCRIPT_EVAL_TYPES as readonly EvalTemplateType[]).includes(
    type,
  );
}

type TranscriptEvalVariableMapping = {
  templateVariable: string;
  selectedColumnId: string;
  jsonSelector?: string | null;
};

/**
 * Judge and decision-model jobs read the transcript through a threads binding.
 * A mapping that is empty or names any other column is not executable.
 */
export function extractTranscriptEvalVariables(
  threads: unknown,
  variableMapping: readonly TranscriptEvalVariableMapping[],
):
  | { ok: true; variables: { var: string; value: unknown }[] }
  | { ok: false; error: string } {
  if (variableMapping.length === 0) {
    return {
      ok: false,
      error: "Transcript evaluation requires a threads variable.",
    };
  }
  if (
    variableMapping.some(
      (mapping) => mapping.selectedColumnId !== TRACE_TRANSCRIPT_EVAL_COLUMN,
    )
  ) {
    return {
      ok: false,
      error: "Transcript evaluation only reads the threads column.",
    };
  }
  const projected = toEvalVariables(threads);
  return {
    ok: true,
    variables: variableMapping.map((mapping) => ({
      var: mapping.templateVariable,
      value: extractValueFromObject(
        { [TRACE_TRANSCRIPT_EVAL_COLUMN]: projected },
        TRACE_TRANSCRIPT_EVAL_COLUMN,
        mapping.jsonSelector ?? undefined,
      ).value,
    })),
  };
}
