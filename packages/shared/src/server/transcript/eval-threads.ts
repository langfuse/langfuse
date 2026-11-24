import type { NormalizedMessage } from "../../utils/normalized-io/types";
import type { Thread, ThreadMessage, Turn } from "./types";

/** A transcript message as eval variable paths see it. */
type EvalVariableMessage = Pick<ThreadMessage, "role" | "parts">;

/** Stored JSON, so a thread may lack either message list. */
type StoredThread = Partial<Pick<Thread, "conversationHistory">> & {
  currentTurn?: Partial<Pick<Turn, "messages">>;
};

/**
 * Stored threads as eval variable paths read them: one history-first `messages`
 * list per thread with only `role` and `parts`; anything else passes through.
 */
export function toEvalVariables(threads: unknown) {
  if (!Array.isArray(threads)) return threads;
  return (threads as StoredThread[]).map((thread) => ({
    messages: [
      ...(thread.conversationHistory ?? []),
      ...(thread.currentTurn?.messages ?? []),
    ].map(({ role, parts }): EvalVariableMessage => ({ role, parts })),
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
 * Threads for code evaluators: whole messages, current-turn ones with provenance.
 * ISO date strings keep in-memory and JSON dispatchers handing over equal values.
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
