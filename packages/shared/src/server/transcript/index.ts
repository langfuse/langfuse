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

/** Compare JSON values without serializing or retaining content keys. */
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, i) => equal(value, b[i]));
  }
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]))
  );
}

const sameMessage = (a: NormalizedMessage, b: NormalizedMessage) =>
  a.role === b.role && a.senderName === b.senderName && equal(a.parts, b.parts);

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

    let thread: Thread | undefined;
    let newInput = input;
    // Try the most recent thread first, then earlier conversations.
    for (let i = threads.length - 1; i >= 0; i--) {
      const candidate = threads[i];
      const matched = new Set<number>();
      const additions: NormalizedMessage[] = [];
      for (const incoming of input) {
        let found = false;
        candidate.messages.forEach((existing, index) => {
          if (sameMessage(existing, incoming)) {
            matched.add(index);
            found = true;
          }
        });
        if (!found) additions.push(incoming);
      }
      if (
        candidate.messages.some((message) => message.role !== "system") &&
        candidate.messages.every(
          (message, index) => message.role === "system" || matched.has(index),
        )
      ) {
        thread = candidate;
        newInput = additions;
        break;
      }
    }

    if (!thread) {
      thread = { messages: [], generationIds: [], traceIds: [] };
      threads.push(thread);
    }
    thread.generationIds.push(generation.id);
    if (!thread.traceIds.includes(generation.traceId)) {
      thread.traceIds.push(generation.traceId);
    }
    for (const message of newInput.concat(output)) {
      thread.messages.push({
        ...message,
        generationId: generation.id,
        traceId: generation.traceId,
      });
    }
  }

  return { threads };
}
