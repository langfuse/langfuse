import { type EvalTemplateType } from "@prisma/client";

import { EvalTemplateTypeEnum } from "./types";
import { extractValueFromObject } from "./utilities";

/** The only source column a trace transcript eval variable can map to. */
export const TRACE_TRANSCRIPT_EVAL_COLUMN = "threads";

/**
 * Judge and decision-model assignments. Code evaluators are not scheduled here.
 */
export const TRACE_TRANSCRIPT_EVAL_TYPES = [
  EvalTemplateTypeEnum.LLM_AS_JUDGE,
  EvalTemplateTypeEnum.DECISION_MODEL,
] as const;

export function isTraceTranscriptEvalType(type: EvalTemplateType) {
  return (TRACE_TRANSCRIPT_EVAL_TYPES as readonly EvalTemplateType[]).includes(
    type,
  );
}

type MappingMessage = {
  id?: string;
  role: unknown;
  senderName?: string;
  parts: unknown;
  finishReason?: unknown;
  source?: unknown;
};

type StoredThread = {
  conversationHistory?: MappingMessage[];
  currentTurn?: { messages?: MappingMessage[] };
};

function messageForMapping(message: MappingMessage) {
  return {
    ...(message.id === undefined ? {} : { id: message.id }),
    role: message.role,
    ...(message.senderName === undefined
      ? {}
      : { senderName: message.senderName }),
    parts: message.parts,
    ...(message.finishReason === undefined
      ? {}
      : { finishReason: message.finishReason }),
    ...(message.source === undefined ? {} : { source: message.source }),
  };
}

/**
 * The thread shape variable paths are picked and resolved against: one
 * `messages` list per thread, history first, without provenance or turn data.
 */
export function projectTranscriptThreadsForMapping(threads: unknown) {
  if (!Array.isArray(threads)) return threads;
  return (threads as StoredThread[]).map((thread) => ({
    messages: [
      ...(thread.conversationHistory ?? []),
      ...(thread.currentTurn?.messages ?? []),
    ].map(messageForMapping),
  }));
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
  const projected = projectTranscriptThreadsForMapping(threads);
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
