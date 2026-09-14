import { partition } from "lodash";
import type { Observation } from "../../domain";
import type { NormalizedMessage } from "../../utils/normalized-io";
import { normalizeIO } from "../normalized-io";
import type { Thread, Transcript } from "./types";

export type * from "./types";

type Generation = Observation & { traceId: string };

const isRelevantObservation = (
  observation: Observation,
): observation is Generation =>
  observation.type === "GENERATION" && observation.traceId !== null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Object property order and observation provenance do not define identity. */
function messageKey(message: NormalizedMessage): string {
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

/**
 * Normalize every generation and append only the input messages not already
 * present in a thread. Replayed messages retain their first-seen provenance.
 */
export function getTranscript(
  observations: Observation[],
  // config: TranscriptConfig = {},
): Transcript | null {
  const generations = observations
    .filter(isRelevantObservation)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  if (generations.length === 0) return null;

  const threads: Thread[] = [];
  const keysByMessage = new WeakMap<NormalizedMessage, string>();
  const countsByThread = new Map<Thread, Map<string, number>>();

  for (const generation of generations) {
    const { messages } = normalizeIO({
      kind: "io",
      io: {
        input: generation.input,
        output: generation.output,
        metadata: generation.metadata,
      },
    });
    const [input, output] = partition(
      messages,
      (message) => message.source === "input",
    );

    for (const message of messages)
      keysByMessage.set(message, messageKey(message));
    const inputKeys = new Set(
      input.map((message) => keysByMessage.get(message)!),
    );
    let thread: Thread | undefined;
    // Try the most recent thread first, then earlier conversations.
    for (let i = threads.length - 1; i >= 0; i--) {
      const candidate = threads[i];
      if (
        candidate.messages.some((message) => message.role !== "system") &&
        candidate.messages.every(
          (message) =>
            message.role === "system" ||
            inputKeys.has(keysByMessage.get(message)!),
        )
      ) {
        thread = candidate;
        break;
      }
    }

    if (!thread) {
      thread = { messages: [], generationIds: [], traceIds: [] };
      threads.push(thread);
      countsByThread.set(thread, new Map());
    }
    thread.generationIds.push(generation.id);
    if (!thread.traceIds.includes(generation.traceId)) {
      thread.traceIds.push(generation.traceId);
    }
    const shownCounts = countsByThread.get(thread)!;
    const inputCounts = new Map<string, number>();
    for (const message of input.concat(output)) {
      const key = keysByMessage.get(message)!;
      const shownCount = shownCounts.get(key) ?? 0;
      if (message.source === "input") {
        const occurrence = (inputCounts.get(key) ?? 0) + 1;
        inputCounts.set(key, occurrence);
        if (occurrence <= shownCount) continue;
      }
      const emitted = {
        ...message,
        generationId: generation.id,
        traceId: generation.traceId,
      };
      thread.messages.push(emitted);
      keysByMessage.set(emitted, key);
      shownCounts.set(key, shownCount + 1);
    }
  }

  return { threads };
}
