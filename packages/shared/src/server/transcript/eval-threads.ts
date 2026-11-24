import type { NormalizedMessage } from "../../utils/normalized-io/types";
import type { Thread } from "./types";

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
 * Stored transcript threads -> the shape eval variable paths resolve against:
 * one `messages` list per thread, history first, no provenance. Reads stored
 * JSON, so anything that is not a thread list passes through unchanged.
 */
export function toMappingThreads(threads: unknown) {
  if (!Array.isArray(threads)) return threads;
  return (threads as StoredThread[]).map((thread) => ({
    messages: [
      ...(thread.conversationHistory ?? []),
      ...(thread.currentTurn?.messages ?? []),
    ].map(messageForMapping),
  }));
}

type CodeEvalTraceMessage = NormalizedMessage & {
  observationId?: string;
  traceId?: string;
  startTime?: string;
  endTime?: string | null;
};

export type CodeEvalTraceThread = { messages: CodeEvalTraceMessage[] };

/**
 * Transcript threads -> code evaluator threads: the mapping shape plus
 * provenance on current-turn messages. Dates are ISO strings so in-memory and
 * JSON dispatchers hand evaluators the same values.
 */
export function toCodeEvalThreads(threads: Thread[]): CodeEvalTraceThread[] {
  return threads.map((thread) => ({
    messages: [
      ...thread.conversationHistory,
      ...thread.currentTurn.messages.map(
        ({ startTime, endTime, ...message }) => ({
          ...message,
          startTime: startTime.toISOString(),
          endTime: endTime?.toISOString() ?? null,
        }),
      ),
    ],
  }));
}
