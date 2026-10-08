import { partition } from "lodash";
import type { NormalizedMessage } from "../../utils/normalized-io";
import type { Thread, ThreadMessage } from "./types";
import type { OrderedObservation } from "./ordering";
import type { ToolCallRegistry } from "./tool-calls";

export type TranscriptObservation = OrderedObservation & { traceId: string };

export type KeyedMessage = {
  message: NormalizedMessage;
  key: string;
};

type Contributor = Pick<
  TranscriptObservation,
  "id" | "traceId" | "type" | "nestingLevel"
>;

/** Thread message with the key it was deduplicated by; tool responses have none. */
export type EmittedMessage = ThreadMessage & { key?: string };

export type ThreadState = {
  /** Every message in display order; `splitTurn` derives the public shape. */
  messages: EmittedMessage[];
  /** Observations in the order they first contributed a message. */
  contributors: Contributor[];
  /** Added reasoning from replayed content must not establish a turn boundary. */
  replaySupplements: WeakSet<EmittedMessage>;
};

export const createThread = (): ThreadState => ({
  messages: [],
  contributors: [],
  replaySupplements: new WeakSet(),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isReasoningPart = (part: NormalizedMessage["parts"][number]) =>
  part.type === "reasoning" ||
  (part.type === "file" && part.reasoning === true);

/**
 * Identity of a message: role and all parts, including reasoning. Provider
 * annotations, property order, and provenance do not define identity.
 */
export function messageKey(message: NormalizedMessage): string {
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

/** Reasoning can change without breaking conversational continuity. */
function continuityKey(message: NormalizedMessage, fullKey?: string): string {
  if (fullKey !== undefined && !message.parts.some(isReasoningPart))
    return fullKey;
  return messageKey({
    ...message,
    parts: message.parts.filter((part) => !isReasoningPart(part)),
  });
}

function contributesToThreadContinuity(message: NormalizedMessage) {
  return (
    message.role !== "system" &&
    message.parts.some((part) => !isReasoningPart(part))
  );
}

/** Find the newest thread whose continuity-defining messages all appear in the input. */
export function findThread(threads: ThreadState[], input: KeyedMessage[]) {
  const inputKeys = new Set(
    input
      .filter(({ message }) => contributesToThreadContinuity(message))
      .map(({ message, key }) => continuityKey(message, key)),
  );
  return threads.findLast(({ messages }) => {
    const defining = messages.filter(
      (message) =>
        message.key !== undefined && contributesToThreadContinuity(message),
    );
    return (
      defining.length > 0 &&
      defining.every((message) =>
        inputKeys.has(continuityKey(message, message.key)),
      )
    );
  });
}

/**
 * Append a generation's messages. The n-th input occurrence of a key repeats
 * the n-th message the thread already shows with that key. If only reasoning
 * differs, retain the new reasoning at its arrival position. Other inputs and
 * all outputs are emitted. Registered tool results attach to their calls.
 */
export function append(
  thread: ThreadState,
  observation: TranscriptObservation,
  input: KeyedMessage[],
  output: KeyedMessage[],
  toolCalls: ToolCallRegistry,
) {
  const deduplicate = createMessageDeduplicator(thread.messages);
  const calls = toolCalls.forGeneration(thread, observation, input, output);

  for (const { message, key: fullKey } of [...input, ...output]) {
    const results: NormalizedMessage["parts"] = [];
    const parts: NormalizedMessage["parts"] = [];
    for (const part of message.parts) {
      (calls.claims(part) ? results : parts).push(part);
    }
    if (parts.length) {
      const key = results.length ? messageKey({ ...message, parts }) : fullKey;
      const retained = deduplicate({ message: { ...message, parts }, key });
      if (retained) {
        const emitted: EmittedMessage = {
          ...message,
          parts: retained.parts,
          key: retained.key,
          observationId: observation.id,
          traceId: observation.traceId,
          startTime: observation.startTime,
          endTime: observation.endTime,
        };
        thread.messages.push(emitted);
        if (retained.isSupplement) thread.replaySupplements.add(emitted);
        addContributor(thread, observation);
        calls.register(emitted);
      }
    }
    calls.attach(results);
  }
}

/** Match each input occurrence to one already-shown occurrence. */
function createMessageDeduplicator(messages: EmittedMessage[]) {
  const shown = new Map<string, number>();
  const seen = new Map<string, number>();

  const isDuplicate = (key: string) => {
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    return occurrence <= (shown.get(key) ?? 0);
  };

  // An answer and its reasoning may later be replayed together or separately.
  const recordContentAndReasoningSeparately = (message: EmittedMessage) => {
    if (message.key === undefined) return;

    const [reasoning, content] = partition(message.parts, isReasoningPart);
    for (const parts of [content, reasoning]) {
      if (!parts.length) continue;

      const key =
        parts.length === message.parts.length
          ? message.key
          : messageKey({ ...message, parts });
      shown.set(key, (shown.get(key) ?? 0) + 1);
    }
  };

  for (const message of messages) recordContentAndReasoningSeparately(message);

  return ({ message, key }: KeyedMessage) => {
    const whole = { parts: message.parts, key, isSupplement: false };
    if (message.source === "output") return whole;

    const [reasoning, content] = partition(message.parts, isReasoningPart);
    const reasoningKey = content.length
      ? messageKey({ ...message, parts: reasoning })
      : key;
    const repeatsContent =
      !content.length ||
      isDuplicate(reasoning.length ? continuityKey(message) : key);
    const repeatsReasoning = !reasoning.length || isDuplicate(reasoningKey);

    // New messages retain their reasoning; count it before checking later replays.
    if (reasoning.length && (!repeatsContent || !repeatsReasoning))
      shown.set(reasoningKey, (shown.get(reasoningKey) ?? 0) + 1);
    if (!repeatsContent) return whole;

    if (!repeatsReasoning)
      return {
        parts: reasoning,
        key: reasoningKey,
        isSupplement: content.length > 0,
      };

    return undefined;
  };
}

export function addContributor(
  thread: ThreadState,
  observation: TranscriptObservation,
) {
  if (
    !thread.contributors.some(
      ({ id, traceId }) =>
        id === observation.id && traceId === observation.traceId,
    )
  ) {
    thread.contributors.push({
      id: observation.id,
      traceId: observation.traceId,
      type: observation.type,
      nestingLevel: observation.nestingLevel,
    });
  }
}

/** Split a thread into replayed history and the turn the last trace added. */
export function splitTurn({
  messages,
  contributors,
  replaySupplements,
}: ThreadState): Thread {
  // Earlier traces are history; the last contributing trace is the current turn.
  const currentTraceId = contributors.at(-1)?.traceId;
  const traceStart =
    messages.findLastIndex(({ traceId }) => traceId !== currentTraceId) + 1;
  // Within it, input replayed before the first output is history up to the
  // previous turn's last assistant or tool message.
  const trace = messages.slice(traceStart);
  const firstOutput = trace.findIndex(({ source }) => source === "output");
  const replayed = trace.slice(0, firstOutput === -1 ? undefined : firstOutput);
  let turnStart =
    traceStart +
    replayed.findLastIndex(
      (message) =>
        (message.role === "assistant" || message.role === "tool") &&
        !replaySupplements.has(message),
    ) +
    1;
  while (
    turnStart < messages.length &&
    replaySupplements.has(messages[turnStart]!)
  )
    turnStart++;
  const current = messages.slice(turnStart);
  const currentContributors = contributors.filter(({ id, traceId }) =>
    current.some(
      (message) => message.observationId === id && message.traceId === traceId,
    ),
  );
  const firstGeneration = currentContributors.find(
    ({ type }) => type === "GENERATION",
  );
  return {
    conversationHistory: messages
      .slice(0, turnStart)
      .map(
        ({ key: _key, observationId, traceId, startTime, endTime, ...rest }) =>
          rest,
      ),
    currentTurn: {
      messages: current.map(({ key: _key, ...message }) => message),
      nestingLevel: firstGeneration?.nestingLevel ?? 0,
      observations: currentContributors.map(({ id, traceId }) => ({
        id,
        traceId,
      })),
    },
  };
}
