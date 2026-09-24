import type { Observation } from "../../domain";
import type { NormalizedMessage } from "../../utils/normalized-io";
import type { Thread, ThreadMessage, Turn } from "./types";
import type { createToolCallRegistry } from "./tool-calls";

export type TranscriptObservation = Observation & { traceId: string };

export type KeyedMessage = {
  message: NormalizedMessage;
  key: string;
};
export type ThreadState = {
  /** Every message of the thread in one list; `splitTurn` derives the public shape. */
  thread: Turn;
  messages: KeyedMessage[];
  shownCounts: Map<string, number>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Object property order and observation provenance do not define identity. */
export function messageKey(message: NormalizedMessage): string {
  return JSON.stringify(
    [message.role, message.parts],
    (_key, value: unknown) =>
      isRecord(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, value[key]]),
          )
        : value,
  );
}

/** Find a thread that matches the input messages. */
export function findThread(states: ThreadState[], input: KeyedMessage[]) {
  const inputKeys = new Set(input.map(({ key }) => key));
  return states.findLast(
    ({ messages }) =>
      messages.some(({ message }) => message.role !== "system") &&
      messages.every(
        ({ message, key }) => message.role === "system" || inputKeys.has(key),
      ),
  );
}

/** Append messages to a thread. */
export function append(
  state: ThreadState,
  observation: TranscriptObservation,
  input: KeyedMessage[],
  output: KeyedMessage[],
  isNewThread: boolean,
  toolCalls: ReturnType<typeof createToolCallRegistry>,
) {
  const { thread, messages, shownCounts } = state;
  const inputCounts = new Map<string, number>();
  const replayCalls = new Map<string, number>();
  const replayTotals = new Map<string, number>();
  // Count first so a truncated replay cannot attach a result to the wrong call.
  for (const { message } of input) {
    for (const part of message.parts) {
      if (part.type === "tool-call" && part.toolCallId)
        replayTotals.set(
          part.toolCallId,
          (replayTotals.get(part.toolCallId) ?? 0) + 1,
        );
    }
  }
  for (const { message, key: originalKey } of [...input, ...output]) {
    const isOutput = message.source === "output";
    const emitted: ThreadMessage = {
      ...message,
      parts: [],
      observationId: observation.id,
      traceId: observation.traceId,
      startTime: observation.startTime,
      endTime: observation.endTime,
    };
    // Anchor output calls before attaching any results carried by the same message.
    if (isOutput) thread.messages.push(emitted);
    for (const part of message.parts) {
      if (
        !toolCalls.consumePart(
          observation,
          part,
          thread,
          emitted,
          replayCalls,
          replayTotals,
        )
      )
        emitted.parts.push(part);
    }
    if (!emitted.parts.length) {
      if (isOutput) thread.messages.splice(thread.messages.indexOf(emitted), 1);
      continue;
    }
    const key =
      emitted.parts.length === message.parts.length
        ? originalKey
        : messageKey(emitted);
    if (!isOutput) {
      const occurrence = (inputCounts.get(key) ?? 0) + 1;
      inputCounts.set(key, occurrence);
      if (!isNewThread && occurrence <= (shownCounts.get(key) ?? 0)) continue;
      thread.messages.push(emitted);
    }
    messages.push({ message: emitted, key });
    shownCounts.set(key, (shownCounts.get(key) ?? 0) + 1);
    addContributor(thread, observation);
  }
}

export function addContributor(
  thread: Turn,
  observation: TranscriptObservation,
) {
  if (
    !thread.observations.some(
      ({ id, traceId }) =>
        id === observation.id && traceId === observation.traceId,
    )
  ) {
    thread.observations.push({
      id: observation.id,
      traceId: observation.traceId,
    });
  }
}

/** Split a thread into replayed history and the turn the last trace added. */
export function splitTurn(thread: Turn): Thread {
  const { messages, observations } = thread;
  // Earlier traces of a session are history; the last contributing trace is
  // the current turn.
  const currentTraceId = observations.at(-1)?.traceId;
  const traceStart =
    messages.findLastIndex(({ traceId }) => traceId !== currentTraceId) + 1;
  // Within that trace, input replayed before the first output is history up
  // to the previous turn's last assistant or tool message. What follows is new.
  const trace = messages.slice(traceStart);
  const firstOutput = trace.findIndex(({ source }) => source === "output");
  const replayed = trace.slice(0, firstOutput === -1 ? undefined : firstOutput);
  const turnStart =
    traceStart +
    replayed.findLastIndex(
      ({ role }) => role === "assistant" || role === "tool",
    ) +
    1;
  const current = messages.slice(turnStart);
  return {
    conversationHistory: messages
      .slice(0, turnStart)
      .map(
        ({ observationId, traceId, startTime, endTime, ...message }) => message,
      ),
    currentTurn: {
      messages: current,
      observations: observations.filter(({ id, traceId }) =>
        current.some(
          (message) =>
            message.observationId === id && message.traceId === traceId,
        ),
      ),
    },
  };
}
