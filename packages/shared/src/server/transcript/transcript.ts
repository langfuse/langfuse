import { partition } from "lodash";
import type { OrderedObservation } from "./ordering";
import { normalizeIO } from "../normalized-io";
import type { Transcript } from "./types";
import {
  append,
  createThread,
  findThread,
  messageKey,
  splitTurn,
  type ThreadState,
} from "./threads";
import { createToolCallRegistry } from "./tool-calls";

/** Check if an observation is relevant for the transcript. */
const isRelevantObservation = (
  observation: OrderedObservation,
): observation is OrderedObservation & { traceId: string } =>
  (observation.type === "GENERATION" || observation.type === "TOOL") &&
  observation.traceId !== null;

/** Normalize original I/O without interpreting provider-specific envelopes. */
function normalize(observation: OrderedObservation) {
  const isTool = observation.type === "TOOL";
  const { messages } = normalizeIO({
    kind: "io",
    io: {
      // Tool inputs are supplied by the generation's tool-call message.
      input: isTool ? undefined : observation.input,
      output: observation.output,
      metadata: observation.metadata,
    },
  });
  return partition(
    messages.map((message) => ({ message, key: messageKey(message) })),
    ({ message }) => message.source === "input",
  );
}

/**
 * Assemble threads from observations: normalize their I/O, reconcile replayed
 * history, and retain first-seen provenance. The caller supplies the
 * observations in transcript order, see `orderObservations`; they are consumed
 * as given. Optional timings separate normalization (including initial message
 * keys) from remaining assembly work, excluding caller-owned observation ordering.
 */
export function assembleTranscript(
  orderedObservations: OrderedObservation[],
  onTimings?: (timings: {
    normalizationMs: number;
    matchingMs: number;
  }) => void,
): Transcript | null {
  const startedAt = onTimings ? performance.now() : 0;
  let normalizationMs = 0;
  const threads: ThreadState[] = [];
  const toolCalls = createToolCallRegistry();

  for (const observation of orderedObservations.filter(isRelevantObservation)) {
    const normalizationStart = onTimings ? performance.now() : 0;
    const [input, output] = normalize(observation);
    if (onTimings) normalizationMs += performance.now() - normalizationStart;
    if (observation.type === "TOOL") {
      toolCalls.attachToolOutput(observation, output);
      continue;
    }
    if (input.length === 0 && output.length === 0) continue;

    let thread = findThread(threads, input);
    if (!thread) {
      thread = createThread();
      threads.push(thread);
    }
    append(thread, observation, input, output, toolCalls);
  }

  const transcript = threads.length
    ? { threads: threads.map(splitTurn) }
    : null;
  onTimings?.({
    normalizationMs,
    matchingMs: performance.now() - startedAt - normalizationMs,
  });
  return transcript;
}
