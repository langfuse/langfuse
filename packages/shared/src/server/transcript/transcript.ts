import { partition } from "lodash";
import type { NormalizedMessage } from "../../utils/normalized-io";
import { toolCallPart } from "../../utils/normalized-io/core/normalize/message-parts/tool-calls";
import { toolResultPart } from "../../utils/normalized-io/core/normalize/message-parts/tool-results";
import type { OrderedObservation } from "./ordering";
import { normalizeIO } from "../normalized-io";
import type { Transcript, TranscriptOptions } from "./types";
import { limitTranscript } from "./limit";
import {
  append,
  createThread,
  findThread,
  messageKey,
  splitTurn,
  type ThreadState,
  type TranscriptObservation,
  type KeyedMessage,
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

/** Express an observed execution using the same parts as model tool messages. */
// TODO: Preserve normalized output parts when constructing standalone tool
// results, and normalize tool input through the canonical observation path.
function normalizeToolExecution(
  observation: TranscriptObservation,
  output: KeyedMessage[],
) {
  if (
    !observation.name ||
    (observation.input == null && observation.output == null)
  )
    return [];
  const parts = output.flatMap(({ message }) => message.parts);
  const result =
    parts.length === 1 && parts[0]?.type === "tool-result"
      ? parts[0]
      : toolResultPart({
          toolName: observation.name,
          output: observation.output,
        });
  const call = toolCallPart({
    toolCallId: result.toolCallId,
    toolName: observation.name,
    input: observation.input,
  });
  if (!call) return [];
  const messages: NormalizedMessage[] = [
    { role: "assistant", source: "output", parts: [call] },
  ];
  if (observation.output != null)
    messages.push({
      role: "tool",
      source: "output",
      parts: [result],
    });
  return messages.map((message) => ({ message, key: messageKey(message) }));
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

  function attachOrAppendTool(
    observation: TranscriptObservation,
    output: KeyedMessage[],
  ) {
    if (toolCalls.attachToolOutput(observation, output) || threads.length !== 1)
      return;

    const normalizationStart = onTimings ? performance.now() : 0;
    const execution = normalizeToolExecution(observation, output);
    if (onTimings) normalizationMs += performance.now() - normalizationStart;
    append(threads[0]!, observation, [], execution, toolCalls);
  }

  for (const observation of orderedObservations.filter(isRelevantObservation)) {
    const normalizationStart = onTimings ? performance.now() : 0;
    const [input, output] = normalize(observation);
    if (onTimings) normalizationMs += performance.now() - normalizationStart;
    if (observation.type === "TOOL") {
      attachOrAppendTool(observation, output);
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
  return transcript && maxCharacters !== undefined
    ? limitTranscript(transcript, maxCharacters)
    : transcript;
}
