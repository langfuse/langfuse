import { partition } from "lodash";
import { normalizeIO } from "../normalized-io";
import type {
  Transcript,
  TranscriptObservation as InputObservation,
  TranscriptOptions,
} from "./types";
import { limitTranscript } from "./limit";
import {
  append,
  findThread,
  messageKey,
  splitTurn,
  type ThreadState,
  type TranscriptObservation,
} from "./threads";
import { createToolCallRegistry } from "./tool-calls";

/** Check if an observation is relevant for the transcript. */
const isRelevantObservation = (
  observation: InputObservation,
): observation is TranscriptObservation =>
  (observation.type === "GENERATION" || observation.type === "TOOL") &&
  observation.traceId !== null;

/** Normalize original I/O without interpreting provider-specific envelopes. */
function normalize(observation: TranscriptObservation) {
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
 * keys) from remaining assembly work, excluding ordering and optional truncation.
 */
export function assembleTranscript(
  orderedObservations: InputObservation[],
  { maxCharacters, onTimings }: TranscriptOptions = {},
): Transcript | null {
  if (
    maxCharacters !== undefined &&
    (!Number.isSafeInteger(maxCharacters) || maxCharacters < 4)
  ) {
    throw new RangeError("maxCharacters must be a safe integer of at least 4");
  }
  const startedAt = onTimings ? performance.now() : 0;
  let normalizationMs = 0;
  const states: ThreadState[] = [];
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

    // Registered responses do not participate in thread selection.
    let state = findThread(states, input);
    const isNewThread = !state;
    if (!state) {
      // Open new thread
      state = {
        thread: { messages: [], observations: [] },
        messages: [],
        shownCounts: new Map(),
      };
      states.push(state);
    }
    append(state, observation, input, output, isNewThread, toolCalls);
  }

  const transcript = states.length
    ? { threads: states.map(({ thread }) => splitTurn(thread)) }
    : null;
  onTimings?.({
    normalizationMs,
    matchingMs: performance.now() - startedAt - normalizationMs,
  });
  return transcript && maxCharacters !== undefined
    ? limitTranscript(transcript, maxCharacters)
    : transcript;
}
