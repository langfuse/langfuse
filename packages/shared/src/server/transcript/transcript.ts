import { partition } from "lodash";
import type { OrderedObservation } from "./ordering";
import { normalizeIO } from "../normalized-io";
import type {
  Transcript,
  TranscriptLevelEvent,
  TranscriptObservation,
  TranscriptOptions,
} from "./types";
import { limitTranscript } from "./limit";
import {
  append,
  createThread,
  findThread,
  splitTurn,
  type ThreadState,
} from "./threads";
import { createToolCallRegistry } from "./tool-calls";
import { prepareMessage } from "./messages";

const LEVEL_STATUS_MAX_CHARACTERS = 1_000;

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
    messages.map(prepareMessage),
    (message) => message.source === "input",
  );
}

/**
 * Assemble threads from observations: normalize their I/O, reconcile replayed
 * history, and retain first-seen provenance. The caller supplies the
 * observations in transcript order, see `orderObservations`; they are consumed
 * as given. Optional timings separate normalization and key preparation from
 * remaining assembly work, excluding ordering and optional truncation.
 */
export function assembleTranscript(
  orderedObservations: OrderedObservation[],
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

  const conversation = threads.length
    ? { threads: threads.map(splitTurn) }
    : null;
  onTimings?.({
    normalizationMs,
    matchingMs: performance.now() - startedAt - normalizationMs,
  });
  const limited =
    conversation && maxCharacters !== undefined
      ? limitTranscript(conversation, maxCharacters)
      : conversation;
  return withLevelEvents(limited, collectLevelEvents(orderedObservations));
}

/** Check if an observation's level and status message belong in `levelEvents`. */
export function hasReportableLevel(
  observation: Pick<TranscriptObservation, "level" | "statusMessage">,
): boolean {
  return (
    observation.level === "ERROR" ||
    (observation.level === "WARNING" && Boolean(observation.statusMessage))
  );
}

function collectLevelEvents(
  observations: OrderedObservation[],
): TranscriptLevelEvent[] {
  const levelEvents: TranscriptLevelEvent[] = [];
  for (const observation of observations)
    if (hasReportableLevel(observation))
      levelEvents.push(toLevelEvent(observation));
  return levelEvents;
}

function toLevelEvent(observation: OrderedObservation): TranscriptLevelEvent {
  return {
    observationId: observation.id,
    traceId: observation.traceId,
    type: observation.type,
    name: observation.name ?? null,
    level: observation.level === "ERROR" ? "ERROR" : "WARNING",
    statusMessage: observation.statusMessage
      ? observation.statusMessage.slice(0, LEVEL_STATUS_MAX_CHARACTERS)
      : null,
    startTime: observation.startTime,
  };
}

function withLevelEvents(
  transcript: Transcript | null,
  levelEvents: TranscriptLevelEvent[],
): Transcript | null {
  if (levelEvents.length === 0) return transcript;
  return { ...(transcript ?? { threads: [] }), levelEvents };
}
