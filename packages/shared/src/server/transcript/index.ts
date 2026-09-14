import { partition } from "lodash";
import type { Observation } from "../../domain";
import type { NormalizedMessage } from "../../utils/normalized-io";
import { normalizeIO } from "../normalized-io";
import type { Thread, Transcript } from "./types";
export type * from "./types";

type Generation = Observation & { traceId: string };

type KeyedMessage = { message: NormalizedMessage; key: string };
type ThreadState = {
  thread: Thread;
  messages: KeyedMessage[];
  shownCounts: Map<string, number>;
};

/** Check if an observation is relevant for the transcript. */
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

/** Normalize generation I/O, partition into input and output messages. */
function normalize(generation: Generation) {
  const { messages } = normalizeIO({
    kind: "io",
    io: {
      input: generation.input,
      output: generation.output,
      metadata: generation.metadata,
    },
  });
  return partition(
    messages.map((message) => ({ message, key: messageKey(message) })),
    ({ message }) => message.source === "input",
  );
}

/** Find a thread that matches the input messages. */
function findThread(states: ThreadState[], input: KeyedMessage[]) {
  const inputKeys = new Set(input.map(({ key }) => key));
  return states.findLast(
    ({ messages }) =>
      messages.some(({ message }) => message.role !== "system") &&
      messages.every(
        ({ message, key }) => message.role === "system" || inputKeys.has(key),
      ),
  );
}

/** Append messages to a thread. */
function append(
  state: ThreadState,
  generation: Generation,
  input: KeyedMessage[],
  output: KeyedMessage[],
  isNewThread: boolean,
) {
  const { thread, shownCounts } = state;
  thread.generationIds.push(generation.id);
  if (!thread.traceIds.includes(generation.traceId)) {
    thread.traceIds.push(generation.traceId);
  }
  if (isNewThread) {
    // Append all input messages, no deduplication checks required
    for (const entry of input) appendMessage(state, generation, entry);
  } else {
    // Deduplicate input messages
    const inputCounts = new Map<string, number>();
    for (const entry of input) {
      const { key } = entry;
      const occurrence = (inputCounts.get(key) ?? 0) + 1;
      inputCounts.set(key, occurrence);
      if (occurrence > (shownCounts.get(key) ?? 0)) {
        appendMessage(state, generation, entry);
      }
    }
  }
  // Append all output messages
  for (const entry of output) appendMessage(state, generation, entry);
}

function appendMessage(
  { thread, messages, shownCounts }: ThreadState,
  generation: Generation,
  { message, key }: KeyedMessage,
) {
  const emitted = {
    ...message,
    generationId: generation.id,
    traceId: generation.traceId,
  };
  thread.messages.push(emitted);
  messages.push({ message: emitted, key });
  shownCounts.set(key, (shownCounts.get(key) ?? 0) + 1);
}

/** Normalize generations, reconcile history, and retain first-seen provenance. */
export function getTranscript(observations: Observation[]): Transcript | null {
  const generations = observations
    .filter(isRelevantObservation)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const states: ThreadState[] = [];

  for (const generation of generations) {
    const [input, output] = normalize(generation);
    if (input.length === 0 && output.length === 0) continue;

    let state = findThread(states, input);
    const isNewThread = !state;
    if (!state) {
      // Open new thread
      state = {
        thread: { messages: [], generationIds: [], traceIds: [] },
        messages: [],
        shownCounts: new Map(),
      };
      states.push(state);
    }
    append(state, generation, input, output, isNewThread);
  }

  return states.length ? { threads: states.map(({ thread }) => thread) } : null;
}
