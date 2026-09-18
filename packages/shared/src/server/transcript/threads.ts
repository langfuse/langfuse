import type { Observation } from "../../domain";
import type { NormalizedMessage } from "../../utils/normalized-io";
import type { Thread, ThreadMessage } from "./types";
import type { createToolCallRegistry } from "./tool-calls";

export type TranscriptObservation = Observation & { traceId: string };

export type KeyedMessage = {
  message: NormalizedMessage;
  key: string;
};
export type ThreadState = {
  thread: Thread;
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
  thread: Thread,
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
