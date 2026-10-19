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
  messageKey,
  splitTurn,
  type ThreadState,
} from "./threads";
import { createToolCallRegistry } from "./tool-calls";

const LEVEL_STATUS_MAX_CHARACTERS = 1_000;
/** The `levelEvents` key and brackets plus a possible `truncated` flag. */
const LEVEL_EVENTS_OVERHEAD_CHARACTERS = ',"levelEvents":[],"truncated":true'
  .length;

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
 * keys) from remaining assembly work, excluding ordering and optional truncation.
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
  const levelEvents = collectLevelEvents(orderedObservations);
  if (maxCharacters === undefined)
    return withLevelEvents(conversation, levelEvents);
  return limitWithLevelEvents(conversation, levelEvents, maxCharacters);
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

/** Reserve up to half of the limit for the earliest level events and limit the conversation to the rest. */
function limitWithLevelEvents(
  conversation: Transcript | null,
  levelEvents: TranscriptLevelEvent[],
  maxCharacters: number,
): Transcript | null {
  const kept = earliestFitting(levelEvents, Math.floor(maxCharacters / 2));
  if (kept.events.length === 0)
    return conversation && limitTranscript(conversation, maxCharacters);
  const limited =
    conversation &&
    limitTranscript(
      conversation,
      maxCharacters - LEVEL_EVENTS_OVERHEAD_CHARACTERS - kept.characters,
    );
  const transcript = {
    ...(limited ?? { threads: [] }),
    levelEvents: kept.events,
  };
  return kept.events.length < levelEvents.length
    ? { ...transcript, truncated: true }
    : transcript;
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

/** Serialized size of the earliest events, joined by commas, that fit the budget. */
function earliestFitting(
  levelEvents: TranscriptLevelEvent[],
  budget: number,
): { events: TranscriptLevelEvent[]; characters: number } {
  let characters = 0;
  let count = 0;
  for (const event of levelEvents) {
    const next =
      characters + (count > 0 ? 1 : 0) + JSON.stringify(event).length;
    if (next > budget) break;
    characters = next;
    count++;
  }
  return { events: levelEvents.slice(0, count), characters };
}
