import { get, partition } from "lodash";
import { parseJsonIfString } from "../../utils/json";
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
} from "./threads";
import { createToolCallRegistry } from "./tool-calls";

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
  const toolCalls = createToolCallRegistry(orderedObservations);
  const observations = orderedObservations.filter(isRelevantObservation);
  const normalizeWithTiming = (observation: OrderedObservation) => {
    const normalizationStart = onTimings ? performance.now() : 0;
    const result = normalize(observation);
    if (onTimings) normalizationMs += performance.now() - normalizationStart;
    return result;
  };
  const { normalizedGenerations, tracesWithGenerationMessages } =
    prepareGenerationFallback(observations, normalizeWithTiming);

  for (const observation of observations) {
    if (
      observation.type === "AGENT" &&
      tracesWithGenerationMessages.has(observation.traceId)
    )
      continue;
    const [input, output] =
      normalizedGenerations.get(observation) ??
      normalizeWithTiming(observation);
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
  return transcript && maxCharacters !== undefined
    ? limitTranscript(transcript, maxCharacters)
    : transcript;
}

function prepareGenerationFallback(
  observations: Array<OrderedObservation & { traceId: string }>,
  normalizeObservation: typeof normalize,
) {
  const normalizedGenerations = new Map<
    OrderedObservation,
    ReturnType<typeof normalize>
  >();
  const tracesWithGenerationMessages = new Set<string>();
  // Decide fallback per trace before emitting an agent's aggregate output.
  // Ordinary generation-led traces keep their single-pass normalization.
  if (observations.some((observation) => observation.type === "AGENT")) {
    for (const observation of observations) {
      if (observation.type !== "GENERATION") continue;
      const messages = normalizeObservation(observation);
      normalizedGenerations.set(observation, messages);
      if (messages.some((part) => part.length > 0))
        tracesWithGenerationMessages.add(observation.traceId);
    }
  }

  return { normalizedGenerations, tracesWithGenerationMessages };
}

/** Check if an observation is relevant for the transcript. */
const isRelevantObservation = (
  observation: OrderedObservation,
): observation is OrderedObservation & { traceId: string } =>
  (observation.type === "GENERATION" ||
    observation.type === "TOOL" ||
    isManagedAgentTurn(observation)) &&
  observation.traceId !== null;

/** Managed session turns carry messages that their model-request spans omit. */
function isManagedAgentTurn(observation: OrderedObservation) {
  if (observation.type !== "AGENT") return false;
  const metadata = observation.metadata;
  const scope =
    metadata?.["scope.name"] ?? get(parseJsonIfString(metadata?.scope), "name");
  const attributes = parseJsonIfString(metadata?.attributes);
  const operation =
    metadata?.["attributes.gen_ai.operation.name"] ??
    get(attributes, ["gen_ai.operation.name"]);
  const sessionId =
    metadata?.["attributes.anthropic.session.id"] ??
    get(attributes, ["anthropic.session.id"]);
  return (
    scope === "com.anthropic.claude-platform" &&
    operation === "invoke_agent" &&
    typeof sessionId === "string" &&
    sessionId.length > 0
  );
}

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
