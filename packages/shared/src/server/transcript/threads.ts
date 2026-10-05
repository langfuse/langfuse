import type { NormalizedMessage } from "../../utils/normalized-io";
import type { Thread, ThreadMessage, Turn } from "./types";
import type { OrderedObservation } from "./ordering";
import type { createToolCallRegistry } from "./tool-calls";

export type TranscriptObservation = OrderedObservation & { traceId: string };

export type KeyedMessage = {
  message: NormalizedMessage;
  key: string;
};
export type AssembledTurn = Pick<Turn, "messages"> & {
  observations: Pick<
    TranscriptObservation,
    "id" | "traceId" | "type" | "nestingLevel"
  >[];
};

export type ThreadState = {
  /** Every message of the thread in one list; `splitTurn` derives the public shape. */
  thread: AssembledTurn;
  messages: KeyedMessage[];
  shownCounts: Map<string, number>;
  shownReasoningCounts: Map<string, number>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Provider annotations, property order, and provenance do not define identity. */
function contentKey(message: NormalizedMessage): string {
  const parts = message.parts.map(
    ({ providerMetadata: _metadata, ...part }) => {
      if (part.type === "tool-call") {
        const { toolType: _toolType, ...call } = part;
        return call;
      }
      return part;
    },
  );
  return JSON.stringify([message.role, parts], (_key, value: unknown) =>
    isRecord(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        )
      : value,
  );
}

const hasContent = (message: NormalizedMessage) =>
  message.parts.some(({ type }) => type !== "reasoning");

/** Reasoning is retained separately, but does not establish continuity. */
export function messageKey(message: NormalizedMessage): string {
  return contentKey({
    ...message,
    parts: message.parts.filter(({ type }) => type !== "reasoning"),
  });
}

/** Find a thread that matches the input messages. */
export function findThread(states: ThreadState[], input: KeyedMessage[]) {
  const inputKeys = new Set(
    input.filter(({ message }) => hasContent(message)).map(({ key }) => key),
  );
  return states.findLast(
    ({ messages }) =>
      messages.some(
        ({ message }) => message.role !== "system" && hasContent(message),
      ) &&
      messages.every(
        ({ message, key }) =>
          message.role === "system" ||
          !hasContent(message) ||
          inputKeys.has(key),
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
  const { thread, messages, shownCounts, shownReasoningCounts } = state;
  const inputCounts = new Map<string, number>();
  const inputReasoningCounts = new Map<string, number>();
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
    const containsContent = hasContent(emitted);
    let isReplay = false;
    if (!isOutput && containsContent) {
      const occurrence = (inputCounts.get(key) ?? 0) + 1;
      inputCounts.set(key, occurrence);
      isReplay = !isNewThread && occurrence <= (shownCounts.get(key) ?? 0);
    }
    // A replay may add reasoning without adding another copy of its text or calls.
    // Keep newly seen reasoning at the observation where it was recorded.
    emitted.parts = emitted.parts.filter((part) => {
      if (part.type !== "reasoning") return !isReplay;
      const reasoningKey = contentKey({ ...message, parts: [part] });
      const shown = shownReasoningCounts.get(reasoningKey) ?? 0;
      const occurrence = (inputReasoningCounts.get(reasoningKey) ?? 0) + 1;
      if (!isOutput) inputReasoningCounts.set(reasoningKey, occurrence);
      if (
        !isOutput &&
        !isNewThread &&
        (!containsContent || isReplay) &&
        occurrence <= shown
      )
        return false;
      shownReasoningCounts.set(reasoningKey, shown + 1);
      return true;
    });
    if (!emitted.parts.length) continue;
    if (!isOutput) thread.messages.push(emitted);
    if (containsContent && !isReplay) {
      messages.push({ message: emitted, key });
      shownCounts.set(key, (shownCounts.get(key) ?? 0) + 1);
    }
    addContributor(thread, observation);
  }
}

export function addContributor(
  thread: AssembledTurn,
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
      type: observation.type,
      nestingLevel: observation.nestingLevel,
    });
  }
}

/** Split a thread into replayed history and the turn the last trace added. */
export function splitTurn(thread: AssembledTurn): Thread {
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
  const currentObservations = observations.filter(({ id, traceId }) =>
    current.some(
      (message) => message.observationId === id && message.traceId === traceId,
    ),
  );
  const firstGeneration = currentObservations.find(
    ({ type }) => type === "GENERATION",
  );
  return {
    conversationHistory: messages
      .slice(0, turnStart)
      .map(
        ({ observationId, traceId, startTime, endTime, ...message }) => message,
      ),
    currentTurn: {
      messages: current,
      nestingLevel: firstGeneration?.nestingLevel ?? 0,
      observations: currentObservations.map(({ id, traceId }) => ({
        id,
        traceId,
      })),
    },
  };
}
