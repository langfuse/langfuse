import type { NormalizedMessage } from "../../utils/normalized-io";
import type { Thread, ThreadMessage } from "./types";
import type { OrderedObservation } from "./ordering";
import type { ToolCallRegistry } from "./tool-calls";
import { contributesToContinuity } from "./continuity";
import {
  prepareMessage,
  type MessageKeys,
  type PreparedMessage,
} from "./messages";
import { createMessageDeduplicator } from "./replay";

export type TranscriptObservation = OrderedObservation & { traceId: string };

type Contributor = Pick<
  TranscriptObservation,
  "id" | "traceId" | "type" | "nestingLevel"
>;

export type ThreadState = {
  /** Display order; attached tool responses carry no comparison keys. */
  messages: (ThreadMessage & MessageKeys)[];
  /** Observations in the order they first contributed a message. */
  contributors: Contributor[];
  /** Enrichment added to replayed identity parts must not establish a turn boundary. */
  replayEnrichments: WeakSet<ThreadMessage>;
};

export const createThread = (): ThreadState => ({
  messages: [],
  contributors: [],
  replayEnrichments: new WeakSet(),
});

/** Find the newest thread whose continuity-defining messages all appear in the input. */
export function findThread(threads: ThreadState[], input: PreparedMessage[]) {
  const incoming = new Set(
    input.filter(contributesToContinuity).map((message) => message.identityKey),
  );
  return threads.findLast(({ messages }) => {
    const defining = messages.filter(contributesToContinuity);
    return (
      defining.length > 0 &&
      defining.every((message) => incoming.has(message.identityKey))
    );
  });
}

/**
 * Append a generation's messages. The n-th input occurrence of a key repeats
 * the n-th message the thread already shows with that key. If only enrichment
 * differs, retain the new enrichment at its arrival position. Other inputs and
 * all outputs are emitted. Registered tool results attach to their calls.
 */
export function append(
  thread: ThreadState,
  observation: TranscriptObservation,
  input: PreparedMessage[],
  output: PreparedMessage[],
  toolCalls: ToolCallRegistry,
) {
  const deduplicate = createMessageDeduplicator(thread.messages);
  const calls = toolCalls.forGeneration(thread, observation, input, output);

  for (const message of [...input, ...output]) {
    const results: NormalizedMessage["parts"] = [];
    const parts: NormalizedMessage["parts"] = [];
    for (const part of message.parts) {
      (calls.claims(part) ? results : parts).push(part);
    }
    if (parts.length > 0) {
      const remaining =
        results.length > 0 ? prepareMessage({ ...message, parts }) : message;
      const retained = deduplicate(remaining);
      if (retained) {
        const emitted: ThreadMessage & MessageKeys = {
          ...message,
          parts: retained.parts,
          identityKey: retained.identityKey,
          enrichmentKey: retained.enrichmentKey,
          observationId: observation.id,
          traceId: observation.traceId,
          startTime: observation.startTime,
          endTime: observation.endTime,
        };
        thread.messages.push(emitted);
        if (retained.isEnrichment) thread.replayEnrichments.add(emitted);
        addContributor(thread, observation);
        calls.register(emitted);
      }
    }
    calls.attach(results);
  }
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
  replayEnrichments,
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
        !replayEnrichments.has(message),
    ) +
    1;
  while (
    turnStart < messages.length &&
    replayEnrichments.has(messages[turnStart]!)
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
        ({
          identityKey: _identityKey,
          enrichmentKey: _enrichmentKey,
          observationId,
          traceId,
          startTime,
          endTime,
          ...rest
        }) => rest,
      ),
    currentTurn: {
      messages: current.map(
        ({
          identityKey: _identityKey,
          enrichmentKey: _enrichmentKey,
          ...message
        }) => message,
      ),
      nestingLevel: firstGeneration?.nestingLevel ?? 0,
      observations: currentContributors.map(({ id, traceId }) => ({
        id,
        traceId,
      })),
    },
  };
}
